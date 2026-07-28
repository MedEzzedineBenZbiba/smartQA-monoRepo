import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IngestionService } from './ingestion.service';
import { UserServiceClient } from './clients/user-service.client';
import { SyncJobStatus } from './interfaces/sync-job.interface';
import { SyncFrequency } from './interfaces/sync-job.interface';

@Injectable()
export class SyncJobScheduler {
  constructor(
    private readonly ingestionService: IngestionService,
    private readonly userServiceClient: UserServiceClient,
    private readonly logger: Logger,
  ) {}

  // Runs every 30 minutes — checks for due sync jobs and processes them
  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleDueSyncJobs(): Promise<void> {
    this.logger.log('Scheduler: checking for due sync jobs…');

    let duejobs;
    try {
      duejobs = await this.userServiceClient.getDueSyncJobs();
    } catch (error: any) {
      this.logger.error(
        `Scheduler: failed to fetch due jobs — ${error.message}`,
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

  private async processSyncJob(job: any): Promise<void> {
    this.logger.log(
      `Scheduler: starting sync for ${job.orgName}/${job.repoName} (jobId=${job.id})`,
    );

    // Mark as syncing
    try {
      await this.userServiceClient.updateSyncJob(job.id, {
        status: SyncJobStatus.SYNCING,
      });
    } catch (error: any) {
      this.logger.error(
        `Scheduler: failed to mark job ${job.id} as syncing — ${error.message}`,
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
    } catch (error: any) {
      this.logger.error(`Scheduler: job ${job.id} failed — ${error.message}`);

      // Mark as failed — QA can see this in the UI and resume manually
      try {
        await this.userServiceClient.updateSyncJob(job.id, {
          status: SyncJobStatus.FAILED,
        });
      } catch (updateError: any) {
        this.logger.error(
          `Scheduler: could not mark job ${job.id} as failed — ${updateError.message}`,
        );
      }
    }
  }

  // ── Helper ────────────────────────────────────────────────────────────────

  private computeNextSyncAt(frequency: SyncFrequency): Date {
    const hoursMap: Record<SyncFrequency, number> = {
      [SyncFrequency.ONE_HOUR]: 1,
      [SyncFrequency.SIX_HOURS]: 6,
      [SyncFrequency.TWELVE_HOURS]: 12,
      [SyncFrequency.DAILY]: 24,
    };
    const next = new Date();
    next.setHours(next.getHours() + hoursMap[frequency]);
    return next;
  }
}
