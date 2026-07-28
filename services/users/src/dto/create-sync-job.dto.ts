import { SyncFrequency, SyncJobStatus } from '../entities/sync-job.entity';

export class CreateSyncJobDto {
  userId!: string;
  repoUrl!: string;
  repoName!: string;
  orgName!: string;
  frequency!: SyncFrequency;
}

export class UpdateSyncJobDto {
  status?: SyncJobStatus;
  lastSyncedAt?: Date;
  nextSyncAt?: Date;
  issueCount?: number;
}
