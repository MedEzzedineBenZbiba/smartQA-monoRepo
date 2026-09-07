import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Logger,
  Param,
  Post,
  Query,
  Redirect,
} from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { UserServiceClient } from './clients/user-service.client';
import { JwtService } from '@nestjs/jwt';
import { SyncFrequency } from './interfaces/sync-job.interface';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Controller('ingestion')
export class IngestionController {
  constructor(
    private readonly ingestionService: IngestionService,
    private readonly userServiceClient: UserServiceClient,
    private readonly jwtService: JwtService,
    private readonly logger: Logger,
  ) {}

  // ── Existing endpoints (untouched) ────────────────────────────────────────

  @Get('check')
  healthCheck() {
    return { status: 'ok' };
  }

  @Get('authorize')
  authorize(@Query('returnTo') returnTo?: string) {
    const url = this.ingestionService.buildAuthorizationUrl(returnTo);
    return { url };
  }

  @Redirect()
  @Get('exchange_code_for_access_token')
  async exchangeCodeForAccessToken(
    @Query('code') code: string,
    @Query('state') state?: string,
  ) {
    const url = await this.ingestionService.exchangeCodeForAccessToken(
      code,
      undefined, // no userId available at this point — by design
      state,
    );
    return { url };
  }

  @Get('ingest')
  ingest(@Headers('authorization') authorizationHeader: string) {
    if (authorizationHeader) {
      const keycloak_access_token = authorizationHeader.split(' ')[1];
      return this.ingestionService.ingestIssues(keycloak_access_token);
    }
    return this.ingestionService.ingestIssues();
  }

  // ── QA — GitHub org + repo listing ───────────────────────────────────────

  @Get('orgs')
  async getUserOrgs(@Headers('authorization') authorizationHeader: string) {
    const userId = this.extractUserId(authorizationHeader);
    return this.ingestionService.getUserOrgs(userId);
  }

  @Get('installations/:installationId/repos')
  async getOrgRepos(
    @Headers('authorization') authorizationHeader: string,
    @Param('installationId') installationId: string,
  ) {
    const userId = this.extractUserId(authorizationHeader);
    return this.ingestionService.getOrgRepos(userId, Number(installationId));
  }

  // ── QA — Sync job management ──────────────────────────────────────────────

  @Post('sync-jobs')
  async createSyncJob(
    @Headers('authorization') authorizationHeader: string,
    @Body()
    body: {
      repoUrl: string;
      repoName: string;
      orgName: string;
      frequency: SyncFrequency;
    },
  ) {
    const userId = this.extractUserId(authorizationHeader);
    return this.userServiceClient.createSyncJob(userId, body);
  }

  @Get('sync-jobs')
  async getSyncJobs(@Headers('authorization') authorizationHeader: string) {
    const userId = this.extractUserId(authorizationHeader);
    return this.userServiceClient.getSyncJobs(userId);
  }

  @Post('sync-jobs/:id/pause')
  async pauseSyncJob(@Param('id') id: string) {
    return this.userServiceClient.pauseSyncJob(id);
  }

  @Post('sync-jobs/:id/resume')
  async resumeSyncJob(@Param('id') id: string) {
    return this.userServiceClient.resumeSyncJob(id);
  }

  @Delete('sync-jobs/:id')
  async deleteSyncJob(@Param('id') id: string) {
    return this.userServiceClient.deleteSyncJob(id);
  }

  // ── QA — GitHub connection status ─────────────────────────────────────────

  @Get('github/status')
  async getGithubStatus(@Headers('authorization') authorizationHeader: string) {
    const userId = this.extractUserId(authorizationHeader);
    const connected = await this.userServiceClient.hasGithubToken(userId);
    return { connected };
  }

  @Delete('github/disconnect')
  async disconnectGithub(
    @Headers('authorization') authorizationHeader: string,
  ) {
    const userId = this.extractUserId(authorizationHeader);
    await this.userServiceClient.deleteGithubToken(userId);
    return { disconnected: true };
  }

  // ── Private helper ────────────────────────────────────────────────────────

  private extractUserId(authorizationHeader: string): string {
    if (!authorizationHeader) {
      throw new Error('Missing authorization header');
    }
    const token = authorizationHeader.split(' ')[1];
    const decoded = this.jwtService.decode<JwtPayload>(token);
    if (!decoded?.sub) {
      throw new Error('Invalid token: missing sub claim');
    }
    return decoded.sub;
  }
}
