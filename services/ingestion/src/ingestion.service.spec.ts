import { Test, TestingModule } from '@nestjs/testing';
import {
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { IngestionService } from './ingestion.service';
import { KafkaProducerClient } from './clients/kafka-producer.client';
import { UserServiceClient } from './clients/user-service.client';

describe('IngestionService', () => {
  let service: IngestionService;

  const mockHttpService = {
    get: jest.fn(),
    post: jest.fn(),
  };

  const mockKafkaProducerClient = {
    publishIssues: jest.fn(),
  };

  const mockLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  const mockConfigService = {
    getOrThrow: jest.fn((key: string) => {
      const map: Record<string, string> = {
        GITHUB_APP_CLIENT_ID: 'client-id',
        GITHUB_APP_CLIENT_SECRET: 'client-secret',
        GITHUB_CALLBACK_URL: 'https://app.example.com/callback',
        githubAuthorizeUrl: 'https://github.com/login/oauth/authorize',
        redirectUrlPath: 'https://app.example.com/callback',
        FRONTEND_BASE_URL: 'https://frontend.example.com',
      };
      return map[key];
    }),
  };

  const mockJwtService = {
    decode: jest.fn(),
  };

  const mockUserServiceClient = {
    saveGithubToken: jest.fn(),
    getGithubToken: jest.fn(),
    deleteGithubToken: jest.fn(),
    getLastIngestionDate: jest.fn(),
    updateLastIngestionDate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: KafkaProducerClient, useValue: mockKafkaProducerClient },
        { provide: Logger, useValue: mockLogger },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: UserServiceClient, useValue: mockUserServiceClient },
      ],
    }).compile();

    service = module.get<IngestionService>(IngestionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------
  // buildAuthorizationUrl
  // ---------------------------------------------------------------------
  describe('buildAuthorizationUrl', () => {
    it('should build the URL without a state param when no returnTo is given', () => {
      const url = service.buildAuthorizationUrl();

      expect(url).toBe(
        'https://github.com/login/oauth/authorize?client_id=client-id&redirect_uri=https://app.example.com/callback',
      );
    });

    it('should append an encoded state param when returnTo is given', () => {
      const url = service.buildAuthorizationUrl('/qa-repos');

      expect(url).toContain('&state=%2Fqa-repos');
    });
  });

  // ---------------------------------------------------------------------
  // exchangeCodeForAccessToken
  // ---------------------------------------------------------------------
  describe('exchangeCodeForAccessToken', () => {
    const tokenResponse = {
      access_token: 'gh-access-token',
      expires_in: 3600,
      refresh_token: 'gh-refresh-token',
      refresh_token_expires_in: 86400,
    };

    it('should save the token and redirect to the safe returnTo path when userId is present', async () => {
      mockHttpService.post.mockReturnValue(of({ data: tokenResponse }));
      mockUserServiceClient.saveGithubToken.mockResolvedValue(undefined);

      const result = await service.exchangeCodeForAccessToken(
        'auth-code',
        'user-1',
        '/qa-repos',
      );

      expect(mockUserServiceClient.saveGithubToken).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          accessToken: 'gh-access-token',
          refreshToken: 'gh-refresh-token',
        }),
      );
      expect(result).toBe(
        'https://frontend.example.com/connect-github?returnTo=%2Fqa-repos&github=connected',
      );
    });

    it('should fall back to the default return path when returnTo is unsafe', async () => {
      mockHttpService.post.mockReturnValue(of({ data: tokenResponse }));
      mockUserServiceClient.saveGithubToken.mockResolvedValue(undefined);

      const result = await service.exchangeCodeForAccessToken(
        'auth-code',
        'user-1',
        '//evil.com',
      );

      expect(result).toBe(
        'https://frontend.example.com/connect-github?returnTo=%2Fissues&github=connected',
      );
    });

    it('should stash the token in the pending slot when no userId is provided', async () => {
      mockHttpService.post.mockReturnValue(of({ data: tokenResponse }));

      await service.exchangeCodeForAccessToken('auth-code');

      expect(mockUserServiceClient.saveGithubToken).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalled();

      // the pending token should now be usable by getValidAccessToken()
      const accessToken = await service.getValidAccessToken();
      expect(accessToken).toBe('gh-access-token');
    });

    it('should throw UnauthorizedException if the exchange response has no access_token', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          data: {
            error: 'bad_verification_code',
            expires_in: 0,
            refresh_token: '',
            refresh_token_expires_in: 0,
          },
        }),
      );

      await expect(
        service.exchangeCodeForAccessToken('bad-code'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should wrap HTTP errors as UnauthorizedException', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('network down')),
      );

      await expect(
        service.exchangeCodeForAccessToken('auth-code'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ---------------------------------------------------------------------
  // ingestIssues
  // ---------------------------------------------------------------------
  describe('ingestIssues', () => {
    it('should ingest a single page of issues with no keycloak_access_token (pending token path)', async () => {
      // prime the pending token via a prior exchange
      mockHttpService.post.mockReturnValue(
        of({
          data: {
            access_token: 'pending-token',
            expires_in: 3600,
            refresh_token: 'r',
            refresh_token_expires_in: 86400,
          },
        }),
      );
      await service.exchangeCodeForAccessToken('code');

      mockHttpService.get.mockReturnValue(
        of({ data: [{ id: 1 }], headers: {} }),
      );

      await service.ingestIssues();

      expect(mockKafkaProducerClient.publishIssues).toHaveBeenCalledWith(
        [{ id: 1 }],
        undefined,
      );
      expect(
        mockUserServiceClient.updateLastIngestionDate,
      ).not.toHaveBeenCalled();
    });

    it('should extract userId, load last ingestion date, and paginate through multiple pages', async () => {
      mockJwtService.decode.mockReturnValue({ sub: 'user-1' });
      mockUserServiceClient.getLastIngestionDate.mockResolvedValue(null);
      mockUserServiceClient.getGithubToken.mockResolvedValue({
        accessToken: 'stored-token',
        accessTokenExpiry: new Date(Date.now() + 1000000),
        refreshToken: 'r',
        refreshTokenExpiry: new Date(Date.now() + 1000000),
      });

      mockHttpService.get
        .mockReturnValueOnce(
          of({
            data: [{ id: 1 }],
            headers: {
              link: '<https://api.github.com/issues?page=2>; rel="next"',
            },
          }),
        )
        .mockReturnValueOnce(of({ data: [{ id: 2 }], headers: {} }));

      mockUserServiceClient.updateLastIngestionDate.mockResolvedValue(
        undefined,
      );

      await service.ingestIssues('valid-keycloak-token');

      expect(mockKafkaProducerClient.publishIssues).toHaveBeenCalledTimes(2);
      expect(mockHttpService.get).toHaveBeenNthCalledWith(
        2,
        'https://api.github.com/issues?page=2',
        expect.any(Object),
      );
      expect(
        mockUserServiceClient.updateLastIngestionDate,
      ).toHaveBeenCalledWith(expect.any(Date), 'user-1');
    });

    it('should persist a pending token now that userId is known', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          data: {
            access_token: 'pending-token-2',
            expires_in: 3600,
            refresh_token: 'r',
            refresh_token_expires_in: 86400,
          },
        }),
      );
      await service.exchangeCodeForAccessToken('code'); // no userId → pending slot filled

      mockJwtService.decode.mockReturnValue({ sub: 'user-9' });
      mockUserServiceClient.getLastIngestionDate.mockResolvedValue(null);
      mockUserServiceClient.saveGithubToken.mockResolvedValue(undefined);
      mockHttpService.get.mockReturnValue(of({ data: [], headers: {} }));
      mockUserServiceClient.updateLastIngestionDate.mockResolvedValue(
        undefined,
      );

      await service.ingestIssues('valid-keycloak-token');

      expect(mockUserServiceClient.saveGithubToken).toHaveBeenCalledWith(
        'user-9',
        expect.objectContaining({ accessToken: 'pending-token-2' }),
      );
    });

    it('should wrap HTTP errors as InternalServerErrorException', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          data: {
            access_token: 'pending-token-3',
            expires_in: 3600,
            refresh_token: 'r',
            refresh_token_expires_in: 86400,
          },
        }),
      );
      await service.exchangeCodeForAccessToken('code');

      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('github down')),
      );

      await expect(service.ingestIssues()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ---------------------------------------------------------------------
  // ingestRepoIssues
  // ---------------------------------------------------------------------
  describe('ingestRepoIssues', () => {
    beforeEach(() => {
      mockUserServiceClient.getGithubToken.mockResolvedValue({
        accessToken: 'stored-token',
        accessTokenExpiry: new Date(Date.now() + 1000000),
        refreshToken: 'r',
        refreshTokenExpiry: new Date(Date.now() + 1000000),
      });
    });

    it('should filter out pull requests and return the total published count', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: [{ id: 1 }, { id: 2, pull_request: {} }],
          headers: {},
        }),
      );

      const total = await service.ingestRepoIssues(
        'user-1',
        'my-org',
        'my-repo',
      );

      expect(mockKafkaProducerClient.publishIssues).toHaveBeenCalledWith(
        [{ id: 1 }],
        'user-1',
      );
      expect(total).toBe(1);
    });

    it('should include a since param when lastSyncedAt is provided', async () => {
      mockHttpService.get.mockReturnValue(of({ data: [], headers: {} }));
      const since = new Date('2024-01-01T00:00:00.000Z');

      await service.ingestRepoIssues('user-1', 'my-org', 'my-repo', since);

      expect(mockHttpService.get).toHaveBeenCalledWith(
        expect.stringContaining(
          `since=${encodeURIComponent(since.toISOString())}`,
        ),
        expect.any(Object),
      );
    });

    it('should wrap HTTP errors as InternalServerErrorException', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('github down')),
      );

      await expect(
        service.ingestRepoIssues('user-1', 'my-org', 'my-repo'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ---------------------------------------------------------------------
  // getUserOrgs
  // ---------------------------------------------------------------------
  describe('getUserOrgs', () => {
    beforeEach(() => {
      mockUserServiceClient.getGithubToken.mockResolvedValue({
        accessToken: 'stored-token',
        accessTokenExpiry: new Date(Date.now() + 1000000),
        refreshToken: 'r',
        refreshTokenExpiry: new Date(Date.now() + 1000000),
      });
    });

    it('should only return Organization-type installations', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: {
            installations: [
              {
                id: 100,
                target_type: 'Organization',
                account: { login: 'my-org', id: 1 },
              },
              {
                id: 200,
                target_type: 'User',
                account: { login: 'personal', id: 2 },
              },
            ],
          },
        }),
      );

      const orgs = await service.getUserOrgs('user-1');

      expect(orgs).toEqual([
        { login: 'my-org', id: 1, installationId: 100, type: 'Organization' },
      ]);
    });

    it('should wrap HTTP errors as InternalServerErrorException', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('github down')),
      );

      await expect(service.getUserOrgs('user-1')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ---------------------------------------------------------------------
  // getOrgRepos
  // ---------------------------------------------------------------------
  describe('getOrgRepos', () => {
    beforeEach(() => {
      mockUserServiceClient.getGithubToken.mockResolvedValue({
        accessToken: 'stored-token',
        accessTokenExpiry: new Date(Date.now() + 1000000),
        refreshToken: 'r',
        refreshTokenExpiry: new Date(Date.now() + 1000000),
      });
    });

    it('should map repositories to the simplified shape', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: {
            repositories: [
              {
                name: 'repo-a',
                full_name: 'my-org/repo-a',
                description: 'desc',
                html_url: 'https://github.com/my-org/repo-a',
                private: false,
              },
            ],
          },
        }),
      );

      const repos = await service.getOrgRepos('user-1', 100);

      expect(repos).toEqual([
        {
          name: 'repo-a',
          fullName: 'my-org/repo-a',
          description: 'desc',
          url: 'https://github.com/my-org/repo-a',
          isPrivate: false,
        },
      ]);
    });

    it('should wrap HTTP errors as InternalServerErrorException', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('github down')),
      );

      await expect(service.getOrgRepos('user-1', 100)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ---------------------------------------------------------------------
  // getValidAccessToken
  // ---------------------------------------------------------------------
  describe('getValidAccessToken', () => {
    it('should throw UnauthorizedException when no userId and no pending token exist', async () => {
      await expect(service.getValidAccessToken()).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when userId has no stored token', async () => {
      mockUserServiceClient.getGithubToken.mockResolvedValue(null);

      await expect(service.getValidAccessToken('user-1')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should delete the token and throw when the refresh token itself has expired', async () => {
      mockUserServiceClient.getGithubToken.mockResolvedValue({
        accessToken: 'a',
        accessTokenExpiry: new Date(Date.now() + 1000000),
        refreshToken: 'r',
        refreshTokenExpiry: new Date(Date.now() - 1000),
      });
      mockUserServiceClient.deleteGithubToken.mockResolvedValue(undefined);

      await expect(service.getValidAccessToken('user-1')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockUserServiceClient.deleteGithubToken).toHaveBeenCalledWith(
        'user-1',
      );
    });

    it('should refresh the access token when it has expired but the refresh token is valid', async () => {
      mockUserServiceClient.getGithubToken.mockResolvedValue({
        accessToken: 'old-token',
        accessTokenExpiry: new Date(Date.now() - 1000),
        refreshToken: 'refresh-token',
        refreshTokenExpiry: new Date(Date.now() + 1000000),
      });
      mockHttpService.post.mockReturnValue(
        of({
          data: {
            access_token: 'refreshed-token',
            expires_in: 3600,
            refresh_token: 'new-refresh-token',
            refresh_token_expires_in: 86400,
          },
        }),
      );
      mockUserServiceClient.saveGithubToken.mockResolvedValue(undefined);

      const token = await service.getValidAccessToken('user-1');

      expect(token).toBe('refreshed-token');
      expect(mockUserServiceClient.saveGithubToken).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ accessToken: 'refreshed-token' }),
      );
    });

    it('should throw UnauthorizedException if the refresh call itself fails', async () => {
      mockUserServiceClient.getGithubToken.mockResolvedValue({
        accessToken: 'old-token',
        accessTokenExpiry: new Date(Date.now() - 1000),
        refreshToken: 'refresh-token',
        refreshTokenExpiry: new Date(Date.now() + 1000000),
      });
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('refresh failed')),
      );

      await expect(service.getValidAccessToken('user-1')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return the stored access token directly when still valid', async () => {
      mockUserServiceClient.getGithubToken.mockResolvedValue({
        accessToken: 'still-valid-token',
        accessTokenExpiry: new Date(Date.now() + 1000000),
        refreshToken: 'refresh-token',
        refreshTokenExpiry: new Date(Date.now() + 1000000),
      });

      const token = await service.getValidAccessToken('user-1');

      expect(token).toBe('still-valid-token');
    });
  });
});
