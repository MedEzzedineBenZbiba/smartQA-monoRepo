import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { KafkaProducerClient } from './clients/kafka-producer.client';
import { ConfigService } from '@nestjs/config';
import {
  GITHUB_ISSUES_PER_PAGE,
  GITHUB_OAUTH_URL,
} from './constants/github.constants';
import { normalizeError } from './common/utils/axios-error.util';
import { JwtService } from '@nestjs/jwt';
import {
  UserServiceClient,
  GithubTokenData,
} from './clients/user-service.client';
import { JwtPayload } from './interfaces/jwt-payload.interface';

interface GithubTokenExchangeResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in: number;
}

interface GithubIssue {
  pull_request?: unknown;
  [key: string]: unknown;
}

interface GithubInstallation {
  id: number;
  target_type: string;
  account: {
    login: string;
    id: number;
  };
}

interface GithubInstallationsResponse {
  installations: GithubInstallation[];
}

interface GithubRepo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  private: boolean;
}

interface GithubReposResponse {
  repositories: GithubRepo[];
}

@Injectable()
export class IngestionService {
  // ── in-memory token REMOVED ───────────────────────────────────────────────
  // private githubTokens!: GithubTokens | null;  ← gone

  constructor(
    private readonly httpService: HttpService,
    private readonly kafkaProducerClient: KafkaProducerClient,
    private readonly logger: Logger,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userServiceClient: UserServiceClient,
  ) {}

  // ── GitHub Apps  ─────────────────────────────────────────────────────────────────

  buildAuthorizationUrl(returnTo?: string): string {
    const client_id = this.configService.getOrThrow<string>(
      'GITHUB_APP_CLIENT_ID',
    );
    const githubAuthorizeUrl =
      this.configService.getOrThrow<string>('githubAuthorizeUrl');
    const redirectUrl =
      this.configService.getOrThrow<string>('redirectUrlPath');

    let url =
      githubAuthorizeUrl +
      '?client_id=' +
      client_id +
      '&redirect_uri=' +
      redirectUrl;

    if (returnTo) {
      url += '&state=' + encodeURIComponent(returnTo);
    }

    return url;
  }

  private readonly ALLOWED_RETURN_PATHS = ['/qa-repos', '/issues'];
  private readonly DEFAULT_RETURN_PATH = '/issues';

  async exchangeCodeForAccessToken(
    code: string,
    userId?: string,
    returnTo?: string,
  ): Promise<string> {
    const exchangeCodeUrl = this.buildExchangeCodeUrl(code);
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<GithubTokenExchangeResponse>(
          exchangeCodeUrl,
          null,
          {
            headers: { Accept: 'application/json' },
          },
        ),
      );

      if (!data.access_token || data.error) {
        throw new InternalServerErrorException(
          data.error_description ?? 'No access_token in response',
        );
      }

      const tokenData = this.buildTokenData(data);

      if (userId) {
        await this.userServiceClient.saveGithubToken(userId, tokenData);
        this.logger.log(`GitHub token saved to DB for user ${userId}`);
      } else {
        this.logger.warn(
          'No userId at OAuth callback — token will be saved on first ingest call',
        );
        this._pendingToken = tokenData;
      }

      // ── Build the frontend redirect target ──────────────────────────────
      const frontendBase =
        this.configService.getOrThrow<string>('FRONTEND_BASE_URL');
      const safePath = this.isSafeReturnPath(returnTo ?? '')
        ? returnTo!
        : this.DEFAULT_RETURN_PATH;

      return `${frontendBase}/connect-github?returnTo=${encodeURIComponent(safePath)}&github=connected`;
      // ── end ───────────────────────────────────────────────────────────
    } catch (error) {
      this.logger.error(normalizeError(error as AxiosError));
      throw new UnauthorizedException((error as Error).message);
    }
  }
  // Temporary in-memory slot ONLY for the brief window between OAuth callback
  // and the first ingest call (seconds, not persistent)
  private _pendingToken: GithubTokenData | null = null;

  // ── Ingestion (SE — personal issues) ─────────────────────────────────────

  private isSafeReturnPath(path: string): boolean {
    // must be relative, same-origin, no protocol-relative "//" tricks
    return /^\/(?!\/)/.test(path);
  }

  async ingestIssues(keycloak_access_token?: string): Promise<void> {
    let userId: string | undefined;
    let lastIngestionDate: Date | null = null;

    if (keycloak_access_token) {
      userId = this.extractUserId(keycloak_access_token);
      lastIngestionDate =
        await this.userServiceClient.getLastIngestionDate(userId);

      // If token arrived via pending slot, persist it now that we have userId
      if (this._pendingToken && userId) {
        await this.userServiceClient.saveGithubToken(
          userId,
          this._pendingToken,
        );
        this._pendingToken = null;
        this.logger.log(`Pending GitHub token saved for user ${userId}`);
      }
    }

    const accessToken = await this.getValidAccessToken(userId);
    const ingestUrl = this.buildIngestGithubIssuesUrl(lastIngestionDate);
    const requestConfig = this.buildGithubAuthHeaders(accessToken);
    const nextPattern = /(?<=<)([\S]*)(?=>; rel="next")/i;
    let pagesRemaining = true;
    let currentUrl = ingestUrl;

    try {
      while (pagesRemaining) {
        const { data, headers } = await firstValueFrom(
          this.httpService.get<GithubIssue[]>(currentUrl, requestConfig),
        );
        console.log(data);
        this.kafkaProducerClient.publishIssues(data, userId);

        const linkHeader = headers.link as string | undefined;
        pagesRemaining = Boolean(linkHeader?.includes('rel="next"'));
        if (pagesRemaining && linkHeader) {
          currentUrl = nextPattern.exec(linkHeader)?.[0] ?? currentUrl;
        }
      }

      if (userId) {
        await this.userServiceClient.updateLastIngestionDate(
          new Date(),
          userId,
        );
      }
    } catch (error) {
      throw new InternalServerErrorException(
        normalizeError(error as AxiosError),
      );
    }
  }

  // ── Ingestion (QA — specific org repo) ───────────────────────────────────

  async ingestRepoIssues(
    userId: string,
    orgName: string,
    repoName: string,
    lastSyncedAt?: Date | null,
  ): Promise<number> {
    const accessToken = await this.getValidAccessToken(userId);
    const requestConfig = this.buildGithubAuthHeaders(accessToken);
    const nextPattern = /(?<=<)([\S]*)(?=>; rel="next")/i;

    const params = new URLSearchParams({
      filter: 'all',
      state: 'all',
      per_page: String(GITHUB_ISSUES_PER_PAGE),
      ...(lastSyncedAt ? { since: lastSyncedAt.toISOString() } : {}),
    });

    let currentUrl = `https://api.github.com/repos/${orgName}/${repoName}/issues?${params}`;
    let pagesRemaining = true;
    let totalPublished = 0;

    try {
      while (pagesRemaining) {
        const { data, headers } = await firstValueFrom(
          this.httpService.get<GithubIssue[]>(currentUrl, requestConfig),
        );

        // Filter out pull requests (GitHub API includes them in /issues)
        const issues = data.filter((item) => !item.pull_request);

        this.kafkaProducerClient.publishIssues(issues, userId);
        totalPublished += issues.length;

        const linkHeader = headers.link as string | undefined;
        pagesRemaining = Boolean(linkHeader?.includes('rel="next"'));
        if (pagesRemaining && linkHeader) {
          currentUrl = nextPattern.exec(linkHeader)?.[0] ?? currentUrl;
        }
      }

      this.logger.log(
        `Repo ingestion complete: ${orgName}/${repoName} → ${totalPublished} issues published`,
      );
      return totalPublished;
    } catch (error) {
      throw new InternalServerErrorException(
        normalizeError(error as AxiosError),
      );
    }
  }

  // ── GitHub App installations + repo listing (QA) ─────────────────────────

  async getUserOrgs(
    userId: string,
  ): Promise<
    { login: string; id: number; installationId: number; type: string }[]
  > {
    const accessToken = await this.getValidAccessToken(userId);
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<GithubInstallationsResponse>(
          'https://api.github.com/user/installations',
          {
            headers: {
              Accept: 'application/vnd.github+json',
              Authorization: `Bearer ${accessToken}`,
              'X-GitHub-Api-Version': '2022-11-28',
            },
          },
        ),
      );

      return (
        data.installations
          // Drop the personal-account installation — QA repo picker is org-only.
          // Remove this filter if you also want to let users pick personal repos.
          .filter((inst) => inst.target_type === 'Organization')
          .map((inst) => ({
            login: inst.account.login,
            id: inst.account.id,
            installationId: inst.id,
            type: inst.target_type,
          }))
      );
    } catch (error) {
      this.logger.error(normalizeError(error as AxiosError));
      throw new InternalServerErrorException(
        'Failed to fetch GitHub installations',
      );
    }
  }

  async getOrgRepos(
    userId: string,
    installationId: number,
  ): Promise<
    {
      name: string;
      fullName: string;
      description: string | null;
      url: string;
      isPrivate: boolean;
    }[]
  > {
    const accessToken = await this.getValidAccessToken(userId);
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<GithubReposResponse>(
          `https://api.github.com/user/installations/${installationId}/repositories`,
          {
            headers: {
              Accept: 'application/vnd.github+json',
              Authorization: `Bearer ${accessToken}`,
              'X-GitHub-Api-Version': '2022-11-28',
            },
          },
        ),
      );

      return data.repositories.map((repo) => ({
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description ?? null,
        url: repo.html_url,
        isPrivate: repo.private,
      }));
    } catch (error) {
      this.logger.error(normalizeError(error as AxiosError));
      throw new InternalServerErrorException(
        `Failed to fetch repos for installation ${installationId}`,
      );
    }
  }

  // ── Token management (reads from PostgreSQL) ──────────────────────────────

  async getValidAccessToken(userId?: string): Promise<string> {
    // No userId — use pending token (brief OAuth→ingest window for SE)
    if (!userId) {
      if (!this._pendingToken) {
        throw new UnauthorizedException(
          'No GitHub token found — user must authorize first',
        );
      }
      return this._pendingToken.accessToken;
    }

    // Load from PostgreSQL
    let tokenData = await this.userServiceClient.getGithubToken(userId);

    if (!tokenData) {
      throw new UnauthorizedException(
        'No GitHub token found — user must authorize first',
      );
    }

    // Refresh token itself expired → full re-auth needed
    if (this.isRefreshTokenExpired(tokenData)) {
      await this.userServiceClient.deleteGithubToken(userId);
      throw new UnauthorizedException(
        'GitHub refresh token expired — user must re-authorize',
      );
    }

    // Access token expired → refresh it
    if (this.isAccessTokenExpired(tokenData)) {
      this.logger.log(`Access token expired for user ${userId} — refreshing…`);
      tokenData = await this.refreshAccessToken(userId, tokenData);
    }

    return tokenData.accessToken;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async refreshAccessToken(
    userId: string,
    current: GithubTokenData,
  ): Promise<GithubTokenData> {
    const params = new URLSearchParams({
      client_id: this.configService.getOrThrow<string>('GITHUB_APP_CLIENT_ID'),
      client_secret: this.configService.getOrThrow<string>(
        'GITHUB_APP_CLIENT_SECRET',
      ),
      grant_type: 'refresh_token',
      refresh_token: current.refreshToken,
    });

    try {
      const { data } = await firstValueFrom(
        this.httpService.post<GithubTokenExchangeResponse>(
          GITHUB_OAUTH_URL,
          params.toString(),
          {
            headers: { Accept: 'application/json' },
          },
        ),
      );

      const refreshed = this.buildTokenData(data);
      await this.userServiceClient.saveGithubToken(userId, refreshed);
      this.logger.log(`GitHub access token refreshed for user ${userId}`);
      return refreshed;
    } catch (error) {
      this.logger.error(normalizeError(error as AxiosError));
      throw new UnauthorizedException('Failed to refresh GitHub access token');
    }
  }

  private isAccessTokenExpired(token: GithubTokenData): boolean {
    const BUFFER_MS = 60 * 1000;
    return (
      Date.now() >= new Date(token.accessTokenExpiry).getTime() - BUFFER_MS
    );
  }

  private isRefreshTokenExpired(token: GithubTokenData): boolean {
    const BUFFER_MS = 60 * 1000;
    return (
      Date.now() >= new Date(token.refreshTokenExpiry).getTime() - BUFFER_MS
    );
  }

  private buildTokenData(raw: GithubTokenExchangeResponse): GithubTokenData {
    const now = Date.now();
    return {
      accessToken: raw.access_token!,
      accessTokenExpiry: new Date(now + raw.expires_in * 1000),
      refreshToken: raw.refresh_token,
      refreshTokenExpiry: new Date(now + raw.refresh_token_expires_in * 1000),
    };
  }

  private buildIngestGithubIssuesUrl(
    lastIngestionDate: Date | string | null,
  ): string {
    const params = new URLSearchParams({
      filter: 'all',
      state: 'all',
      per_page: String(GITHUB_ISSUES_PER_PAGE),
    });

    if (lastIngestionDate) {
      const dateObj =
        lastIngestionDate instanceof Date
          ? lastIngestionDate
          : new Date(lastIngestionDate);

      if (!isNaN(dateObj.getTime())) {
        params.set('since', dateObj.toISOString());
      }
    }

    return `https://api.github.com/issues?${params}`;
  }

  private buildGithubAuthHeaders(accessToken: string) {
    return {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    };
  }

  private buildExchangeCodeUrl(code: string): string {
    const params = new URLSearchParams({
      client_id: this.configService.getOrThrow<string>('GITHUB_APP_CLIENT_ID'),
      client_secret: this.configService.getOrThrow<string>(
        'GITHUB_APP_CLIENT_SECRET',
      ),
      code,
      redirect_uri: this.configService.getOrThrow<string>(
        'GITHUB_CALLBACK_URL',
      ),
    });
    return `${GITHUB_OAUTH_URL}?${params}`;
  }

  private extractUserId(access_token: string): string {
    const decoded = this.jwtService.decode<JwtPayload>(access_token);
    if (!decoded?.sub) {
      throw new UnauthorizedException('Invalid token: missing sub claim');
    }
    return decoded.sub;
  }
}
