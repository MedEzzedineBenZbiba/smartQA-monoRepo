import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import {
  SyncJob,
  SyncFrequency,
  SyncJobStatus,
} from './entities/sync-job.entity';
import { CreateSyncJobDto, UpdateSyncJobDto } from './dto/create-sync-job.dto';
import { normalizeError } from './common/utils/normalizedError.util';

@Injectable()
export class SyncJobService {
  constructor(
    @InjectRepository(SyncJob)
    private readonly syncJobRepository: Repository<SyncJob>,
    private readonly logger: Logger,
  ) {}

  async createSyncJob(dto: CreateSyncJobDto): Promise<SyncJob> {
    try {
      const nextSyncAt = this.computeNextSyncAt(dto.frequency);
      const job = this.syncJobRepository.create({
        ...dto,
        nextSyncAt,
        lastSyncedAt: null,
        status: SyncJobStatus.ACTIVE,
        issueCount: 0,
      });
      return await this.syncJobRepository.save(job);
    } catch (error: any) {
      this.logger.error(normalizeError(error));
      throw new InternalServerErrorException(error.message);
    }
  }

  async getSyncJobsByUser(userId: string): Promise<SyncJob[]> {
    try {
      return await this.syncJobRepository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
      });
    } catch (error: any) {
      this.logger.error(normalizeError(error));
      throw new InternalServerErrorException(error.message);
    }
  }

  // Called by scheduler — returns all jobs due to run right now
  async getDueSyncJobs(): Promise<SyncJob[]> {
    try {
      return await this.syncJobRepository.find({
        where: {
          status: SyncJobStatus.ACTIVE,
          nextSyncAt: LessThanOrEqual(new Date()),
        },
      });
    } catch (error: any) {
      this.logger.error(normalizeError(error));
      throw new InternalServerErrorException(error.message);
    }
  }

  async updateSyncJob(id: string, dto: UpdateSyncJobDto): Promise<void> {
    try {
      const result = await this.syncJobRepository.update({ id }, dto);
      if (result.affected === 0) {
        throw new NotFoundException(`Sync job ${id} not found`);
      }
    } catch (error: any) {
      this.logger.error(normalizeError(error));
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(error.message);
    }
  }

  async pauseSyncJob(id: string): Promise<void> {
    try {
      const result = await this.syncJobRepository.update(
        { id },
        { status: SyncJobStatus.PAUSED },
      );
      if (result.affected === 0) {
        throw new NotFoundException(`Sync job ${id} not found`);
      }
    } catch (error: any) {
      this.logger.error(normalizeError(error));
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(error.message);
    }
  }

  async resumeSyncJob(id: string): Promise<void> {
    try {
      const job = await this.syncJobRepository.findOne({ where: { id } });
      if (!job) throw new NotFoundException(`Sync job ${id} not found`);

      const nextSyncAt = this.computeNextSyncAt(job.frequency);
      await this.syncJobRepository.update(
        { id },
        { status: SyncJobStatus.ACTIVE, nextSyncAt },
      );
    } catch (error: any) {
      this.logger.error(normalizeError(error));
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(error.message);
    }
  }

  async deleteSyncJob(id: string): Promise<void> {
    try {
      const result = await this.syncJobRepository.delete({ id });
      if (result.affected === 0) {
        throw new NotFoundException(`Sync job ${id} not found`);
      }
    } catch (error: any) {
      this.logger.error(normalizeError(error));
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(error.message);
    }
  }

  // ── Helper ────────────────────────────────────────────────────────────────

  computeNextSyncAt(frequency: SyncFrequency): Date {
    const hoursMap: Record<SyncFrequency, number> = {
      [SyncFrequency.ONE_HOUR]: 1,
      [SyncFrequency.SIX_HOURS]: 6,
      [SyncFrequency.TWELVE_HOURS]: 12,
      [SyncFrequency.DAILY]: 24,
    };
    const now = new Date();
    now.setHours(now.getHours() + hoursMap[frequency]);
    return now;
  }
}
