import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IngestionService } from './ingestion.service';
import { UserServiceClient, SyncJobData } from './clients/user-service.client';
import { SyncFrequency, SyncJobStatus } from './interfaces/sync-job.interface';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class SyncJobScheduler {
  constructor(
    private readonly ingestionService: IngestionService,
    private readonly userServiceClient: UserServiceClient,
    private readonly logger: Logger,
  ) {}

  // Runs every 30 minutes — checks for due sync jobs and processes them
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleDueSyncJobs(): Promise<void> {
    this.logger.log('Scheduler: checking for due sync jobs…');

    let duejobs: SyncJobData[];
    try {
      duejobs = await this.userServiceClient.getDueSyncJobs();
    } catch (error) {
      this.logger.error(
        `Scheduler: failed to fetch due jobs — ${errorMessage(error)}`,
      );
      return;
    }

    if (duejobs.length === 0) {
      this.logger.log('Scheduler: no due sync jobs found');
      return;
    }

    this.logger.log(`Scheduler: ${duejobs.length} job(s) due — processing…`);

    // Process all due jobs concurrently
    await Promise.allSettled(duejobs.map((job) => this.processSyncJob(job)));
  }

  // ── Process a single sync job ─────────────────────────────────────────────

  private async processSyncJob(job: SyncJobData): Promise<void> {
    this.logger.log(
      `Scheduler: starting sync for ${job.orgName}/${job.repoName} (jobId=${job.id})`,
    );

    // Mark as syncing
    try {
      await this.userServiceClient.updateSyncJob(job.id, {
        status: SyncJobStatus.SYNCING,
      });
    } catch (error) {
      this.logger.error(
        `Scheduler: failed to mark job ${job.id} as syncing — ${errorMessage(error)}`,
      );
      return;
    }

    try {
      // Run the actual ingestion
      const issueCount = await this.ingestionService.ingestRepoIssues(
        job.userId,
        job.orgName,
        job.repoName,
        job.lastSyncedAt ? new Date(job.lastSyncedAt) : null,
      );

      // Compute next sync time based on frequency
      const nextSyncAt = this.computeNextSyncAt(job.frequency);

      // Mark as active + update timestamps + increment issue count
      await this.userServiceClient.updateSyncJob(job.id, {
        status: SyncJobStatus.ACTIVE,
        lastSyncedAt: new Date(),
        nextSyncAt,
        issueCount: (job.issueCount ?? 0) + issueCount,
      });

      this.logger.log(
        `Scheduler: job ${job.id} completed — ` +
          `${issueCount} new issues, next sync at ${nextSyncAt.toISOString()}`,
      );
    } catch (error) {
      this.logger.error(
        `Scheduler: job ${job.id} failed — ${errorMessage(error)}`,
      );

      // Mark as failed — QA can see this in the UI and resume manually
      try {
        await this.userServiceClient.updateSyncJob(job.id, {
          status: SyncJobStatus.FAILED,
        });
      } catch (updateError) {
        this.logger.error(
          `Scheduler: could not mark job ${job.id} as failed — ${errorMessage(updateError)}`,
        );
      }
    }
  }

  // ── Helper ────────────────────────────────────────────────────────────────

  private computeNextSyncAt(frequency: SyncFrequency): Date {
    const minutesMap: Record<SyncFrequency, number> = {
      [SyncFrequency.FIVE_MIN]: 5,
      [SyncFrequency.ONE_HOUR]: 60,
      [SyncFrequency.SIX_HOURS]: 6 * 60,
      [SyncFrequency.TWELVE_HOURS]: 12 * 60,
      [SyncFrequency.DAILY]: 24 * 60,
    };
    const next = new Date();
    next.setMinutes(next.getMinutes() + minutesMap[frequency]);
    return next;
  }
}
