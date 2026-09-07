import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { ConsulClient } from './consul.client';
import { normalizeError } from '../common/utils/axios-error.util';
import { SyncFrequency, SyncJobStatus } from '../interfaces/sync-job.interface';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface GithubTokenData {
  accessToken: string;
  accessTokenExpiry: Date;
  refreshToken: string;
  refreshTokenExpiry: Date;
}

export interface SyncJobData {
  id: string;
  userId: string;
  repoUrl: string;
  repoName: string;
  orgName: string;
  frequency: SyncFrequency;
  lastSyncedAt: Date | null;
  nextSyncAt: Date;
  status: SyncJobStatus;
  issueCount: number;
  createdAt: Date;
}

export interface UpdateSyncJobData {
  status?: SyncJobStatus;
  lastSyncedAt?: Date;
  nextSyncAt?: Date;
  issueCount?: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class UserServiceClient implements OnModuleInit {
  private userServiceName!: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly logger: Logger,
    private readonly configService: ConfigService,
    private readonly consulClient: ConsulClient,
  ) {}

  onModuleInit() {
    this.userServiceName = this.configService.getOrThrow('USER_SERVICE_NAME');
  }

  // ── Existing methods (untouched) ──────────────────────────────────────────

  async updateLastIngestionDate(lastIngestionDate: Date, userId: string) {
    const url = await this.getLastIngestionDatePropertyUrl();
    try {
      await firstValueFrom(
        this.httpService.patch(url, {
          lastIngestionDate,
          userId,
        }),
      );
    } catch (error) {
      this.logger.error(normalizeError(error as AxiosError));
      throw new InternalServerErrorException(errorMessage(error));
    }
  }

  async getLastIngestionDate(userId: string): Promise<Date | null> {
    const url = (await this.getLastIngestionDatePropertyUrl()) + '/' + userId;
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<Date | null>(url),
      );
      return data;
    } catch (error) {
      this.logger.error(normalizeError(error as AxiosError));
      throw new InternalServerErrorException(
        `${errorMessage(error)} ${(error as Error).name}`,
      );
    }
  }

  // ── GitHub token methods ──────────────────────────────────────────────────

  async saveGithubToken(
    userId: string,
    tokenData: GithubTokenData,
  ): Promise<void> {
    const url = `${await this.getBaseUrl()}/users/github-tokens`;
    try {
      await firstValueFrom(
        this.httpService.post(url, { userId, ...tokenData }),
      );
    } catch (error) {
      this.logger.error(normalizeError(error as AxiosError));
      throw new InternalServerErrorException(
        `Failed to save GitHub token: ${errorMessage(error)}`,
      );
    }
  }

  async getGithubToken(userId: string): Promise<GithubTokenData | null> {
    const url = `${await this.getBaseUrl()}/users/github-tokens/${userId}`;
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<GithubTokenData | null>(url),
      );
      return data ?? null;
    } catch (error) {
      // 404 means no token yet — not an error, just not connected
      if ((error as AxiosError)?.response?.status === 404) return null;
      this.logger.error(normalizeError(error as AxiosError));
      throw new InternalServerErrorException(
        `Failed to get GitHub token: ${errorMessage(error)}`,
      );
    }
  }

  async hasGithubToken(userId: string): Promise<boolean> {
    const url = `${await this.getBaseUrl()}/users/github-tokens/${userId}/exists`;
    try {
      const { data } = await firstValueFrom(this.httpService.get<boolean>(url));
      return data === true;
    } catch (error) {
      this.logger.error(normalizeError(error as AxiosError));
      throw new InternalServerErrorException(
        `Failed to check GitHub token: ${errorMessage(error)}`,
      );
    }
  }

  async deleteGithubToken(userId: string): Promise<void> {
    const url = `${await this.getBaseUrl()}/users/github-tokens/${userId}`;
    try {
      await firstValueFrom(this.httpService.delete(url));
    } catch (error) {
      this.logger.error(normalizeError(error as AxiosError));
      throw new InternalServerErrorException(
        `Failed to delete GitHub token: ${errorMessage(error)}`,
      );
    }
  }

  // ── Sync job methods ──────────────────────────────────────────────────────

  async createSyncJob(
    userId: string,
    jobData: Omit<
      SyncJobData,
      | 'id'
      | 'userId'
      | 'lastSyncedAt'
      | 'nextSyncAt'
      | 'status'
      | 'issueCount'
      | 'createdAt'
    >,
  ): Promise<SyncJobData> {
    const url = `${await this.getBaseUrl()}/users/sync-jobs`;
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<SyncJobData>(url, { userId, ...jobData }),
      );
      return data;
    } catch (error) {
      this.logger.error(normalizeError(error as AxiosError));
      throw new InternalServerErrorException(
        `Failed to create sync job: ${errorMessage(error)}`,
      );
    }
  }

  async getSyncJobs(userId: string): Promise<SyncJobData[]> {
    const url = `${await this.getBaseUrl()}/users/sync-jobs/user/${userId}`;
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<SyncJobData[]>(url),
      );
      return data ?? [];
    } catch (error) {
      this.logger.error(normalizeError(error as AxiosError));
      throw new InternalServerErrorException(
        `Failed to get sync jobs: ${errorMessage(error)}`,
      );
    }
  }

  async getDueSyncJobs(): Promise<SyncJobData[]> {
    const url = `${await this.getBaseUrl()}/users/sync-jobs/due`;
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<SyncJobData[]>(url),
      );
      return data ?? [];
    } catch (error) {
      this.logger.error(normalizeError(error as AxiosError));
      throw new InternalServerErrorException(
        `Failed to get due sync jobs: ${errorMessage(error)}`,
      );
    }
  }

  async updateSyncJob(id: string, updates: UpdateSyncJobData): Promise<void> {
    const url = `${await this.getBaseUrl()}/users/sync-jobs/${id}`;
    try {
      await firstValueFrom(this.httpService.patch(url, updates));
    } catch (error) {
      this.logger.error(normalizeError(error as AxiosError));
      throw new InternalServerErrorException(
        `Failed to update sync job: ${errorMessage(error)}`,
      );
    }
  }

  async pauseSyncJob(id: string): Promise<void> {
    const url = `${await this.getBaseUrl()}/users/sync-jobs/${id}/pause`;
    try {
      await firstValueFrom(this.httpService.post(url, {}));
    } catch (error) {
      this.logger.error(normalizeError(error as AxiosError));
      throw new InternalServerErrorException(
        `Failed to pause sync job: ${errorMessage(error)}`,
      );
    }
  }

  async resumeSyncJob(id: string): Promise<void> {
    const url = `${await this.getBaseUrl()}/users/sync-jobs/${id}/resume`;
    try {
      await firstValueFrom(this.httpService.post(url, {}));
    } catch (error) {
      this.logger.error(normalizeError(error as AxiosError));
      throw new InternalServerErrorException(
        `Failed to resume sync job: ${errorMessage(error)}`,
      );
    }
  }

  async deleteSyncJob(id: string): Promise<void> {
    const url = `${await this.getBaseUrl()}/users/sync-jobs/${id}`;
    try {
      await firstValueFrom(this.httpService.delete(url));
    } catch (error) {
      this.logger.error(normalizeError(error as AxiosError));
      throw new InternalServerErrorException(
        `Failed to delete sync job: ${errorMessage(error)}`,
      );
    }
  }

  // ── Private helpers (unchanged) ───────────────────────────────────────────

  private async getLastIngestionDatePropertyUrl(): Promise<string> {
    return `${await this.getBaseUrl()}/users/last-ingestion-date`;
  }

  private async getBaseUrl(): Promise<string> {
    return await this.consulClient.discoverService(this.userServiceName);
  }
}
