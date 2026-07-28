import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum SyncFrequency {
  ONE_HOUR = '1h',
  SIX_HOURS = '6h',
  TWELVE_HOURS = '12h',
  DAILY = '24h',
}

export enum SyncJobStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  SYNCING = 'syncing',
  FAILED = 'failed',
}

@Entity('sync_jobs')
export class SyncJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'repo_url', type: 'text' })
  repoUrl!: string;

  @Column({ name: 'repo_name' })
  repoName!: string;

  @Column({ name: 'org_name' })
  orgName!: string;

  @Column({
    type: 'enum',
    enum: SyncFrequency,
    default: SyncFrequency.SIX_HOURS,
  })
  frequency!: SyncFrequency;

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt!: Date | null;

  @Column({ name: 'next_sync_at', type: 'timestamptz' })
  nextSyncAt!: Date;

  @Column({
    type: 'enum',
    enum: SyncJobStatus,
    default: SyncJobStatus.ACTIVE,
  })
  status!: SyncJobStatus;

  @Column({ name: 'issue_count', type: 'int', default: 0 })
  issueCount!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
