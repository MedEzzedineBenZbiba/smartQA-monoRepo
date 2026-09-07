import { Test, TestingModule } from '@nestjs/testing';
import {
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { HttpService } from '@nestjs/axios';
import { JwtService } from '@nestjs/jwt';
import { of, throwError } from 'rxjs';
import { Types } from 'mongoose';

import { IssuesService } from './issues.service';
import { Issue } from './issue.schema';
import { ConsulClient } from './clients/consul.client';

describe('IssuesService', () => {
  let service: IssuesService;

  // ── chainable query mock helper ──────────────────────────────────────────
  const makeChainable = (resolvedValue: any) => {
    const chain: any = {
      find: jest.fn(() => chain),
      select: jest.fn(() => chain),
      sort: jest.fn(() => chain),
      skip: jest.fn(() => chain),
      limit: jest.fn(() => chain),
      lean: jest.fn(() => chain),
      exec: jest.fn().mockResolvedValue(resolvedValue),
    };
    return chain;
  };

  const mockIssueModel: any = {
    find: jest.fn(),
    findOneAndUpdate: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
    bulkWrite: jest.fn(),
    collection: {
      listSearchIndexes: jest.fn(() => ({
        toArray: jest.fn().mockResolvedValue([]),
      })),
    },
  };

  const mockLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  const mockConsulClient = {
    discoverService: jest.fn(),
  };

  const mockHttpService = {
    get: jest.fn(),
    post: jest.fn(),
  };

  const mockJwtService = {
    decode: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssuesService,
        { provide: getModelToken(Issue.name), useValue: mockIssueModel },
        { provide: Logger, useValue: mockLogger },
        { provide: ConsulClient, useValue: mockConsulClient },
        { provide: HttpService, useValue: mockHttpService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<IssuesService>(IssuesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------
  // createAndOverideOldOne
  // ---------------------------------------------------------------------
  describe('createAndOverideOldOne', () => {
    const dto = {
      issueId: 1,
      url: 'https://github.com/org/repo/issues/1',
      userId: 'user-1',
    };

    it('should upsert and return the updated issue', async () => {
      mockIssueModel.findOneAndUpdate.mockResolvedValue({ _id: 'x', ...dto });

      const result = await service.createAndOverideOldOne(dto as any);

      expect(mockIssueModel.findOneAndUpdate).toHaveBeenCalledWith(
        { issueId: 1, url: dto.url, userId: 'user-1' },
        { $set: dto },
        { upsert: true, new: true },
      );
      expect(result).toEqual({ _id: 'x', ...dto });
    });

    it('should wrap errors as InternalServerErrorException', async () => {
      mockIssueModel.findOneAndUpdate.mockRejectedValue(new Error('db down'));

      await expect(service.createAndOverideOldOne(dto as any)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ---------------------------------------------------------------------
  // createFromKafkaPayload
  // ---------------------------------------------------------------------
  describe('createFromKafkaPayload', () => {
    const basePayload = {
      issue: {
        id: 42,
        state: 'open',
        updated_at: new Date(),
        title: 'Bug title',
        body: 'This is a reasonably long issue body with enough words',
        created_at: new Date(),
        userId: 'user-1',
        url: 'https://github.com/org/repo/issues/42',
      },
    };

    it('should skip pull requests', async () => {
      const payload = {
        issue: { ...basePayload.issue, pull_request: {} },
      };

      await service.createFromKafkaPayload(payload as any);

      expect(mockIssueModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Skipping pull request'),
      );
    });

    it('should skip embedding when body has fewer than 5 words', async () => {
      const payload = {
        issue: { ...basePayload.issue, body: 'too short' },
      };
      mockIssueModel.findOneAndUpdate.mockResolvedValue({});

      await service.createFromKafkaPayload(payload as any);

      expect(mockConsulClient.discoverService).not.toHaveBeenCalled();
      expect(mockIssueModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $set: expect.objectContaining({ embedding: null }),
        }),
        expect.any(Object),
      );
    });

    it('should fetch an embedding and save the issue when body has enough words', async () => {
      mockConsulClient.discoverService.mockResolvedValue(
        'http://vector-service',
      );
      mockHttpService.post.mockReturnValue(
        of({ data: { embedding: [0.1, 0.2, 0.3] } }),
      );
      mockIssueModel.findOneAndUpdate.mockResolvedValue({});

      await service.createFromKafkaPayload(basePayload as any);

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'http://vector-service/api/embed',
        expect.objectContaining({ issue_title: 'Bug title' }),
        expect.any(Object),
      );
      expect(mockIssueModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $set: expect.objectContaining({ embedding: [0.1, 0.2, 0.3] }),
        }),
        expect.any(Object),
      );
    });
  });

  // ---------------------------------------------------------------------
  // findAll
  // ---------------------------------------------------------------------
  describe('findAll', () => {
    it('should return paginated data and total', async () => {
      const chain = makeChainable([{ title: 'issue 1' }]);
      mockIssueModel.find.mockReturnValue(chain);
      mockIssueModel.countDocuments.mockResolvedValue(1);

      const result = await service.findAll(1, 10);

      expect(result).toEqual({ data: [{ title: 'issue 1' }], total: 1 });
    });

    it('should apply search, state, and repos filters', async () => {
      const chain = makeChainable([]);
      mockIssueModel.find.mockReturnValue(chain);
      mockIssueModel.countDocuments.mockResolvedValue(0);

      await service.findAll(1, 10, 'user-1', 'bug', 'open', ['org/repo']);

      expect(mockIssueModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          state: 'open',
          repo: { $in: ['org/repo'] },
          $or: expect.any(Array),
        }),
      );
    });

    it('should wrap errors as InternalServerErrorException', async () => {
      mockIssueModel.find.mockImplementation(() => {
        throw new Error('boom');
      });

      await expect(service.findAll(1, 10)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ---------------------------------------------------------------------
  // getRepos
  // ---------------------------------------------------------------------
  describe('getRepos', () => {
    it('should return repo counts and total', async () => {
      mockIssueModel.aggregate.mockResolvedValue([
        {
          data: [{ _id: 'org/repo', count: 3 }],
          totalCount: [{ count: 1 }],
        },
      ]);

      const result = await service.getRepos('', 1, 10);

      expect(result).toEqual({
        data: [{ repo: 'org/repo', count: 3 }],
        total: 1,
      });
    });

    it('should wrap errors as InternalServerErrorException', async () => {
      mockIssueModel.aggregate.mockRejectedValue(new Error('boom'));

      await expect(service.getRepos('', 1, 10)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ---------------------------------------------------------------------
  // getDashboardStats
  // ---------------------------------------------------------------------
  describe('getDashboardStats', () => {
    it('should aggregate totals, quality, cluster distribution and recent issues', async () => {
      mockJwtService.decode.mockReturnValue({ sub: 'user-1' });

      mockIssueModel.aggregate
        .mockResolvedValueOnce([
          {
            totals: [
              { _id: 'open', count: 5 },
              { _id: 'closed', count: 3 },
            ],
            quality: [{ poorlyDescribed: 1, noise: 1, clustered: 6 }],
          },
        ])
        .mockResolvedValueOnce([
          {
            _id: { cluster_id: 0, cluster_label: 'Login issues' },
            counts: [
              { state: 'open', count: 2 },
              { state: 'closed', count: 1 },
            ],
          },
        ]);

      const chain = makeChainable([
        {
          _id: new Types.ObjectId(),
          title: 'Recent issue',
          state: 'open',
          cluster_id: 0,
          cluster_label: 'Login issues',
          created_at: new Date(),
          embedding: [0.1],
        },
      ]);
      mockIssueModel.find.mockReturnValue(chain);

      const result = await service.getDashboardStats('token');

      expect(result.open).toBe(5);
      expect(result.closed).toBe(3);
      expect(result.total).toBe(8);
      expect(result.clustered).toBe(6);
      expect(result.clusterDistribution).toEqual([
        {
          cluster_id: 0,
          cluster_label: 'Login issues',
          openCount: 2,
          closedCount: 1,
        },
      ]);
      expect(result.recentIssues[0].isPoorlyDescribed).toBe(false);
      expect(result.recentIssues[0].isNoise).toBe(false);
    });

    it('should wrap errors as InternalServerErrorException', async () => {
      mockJwtService.decode.mockReturnValue({ sub: 'user-1' });
      mockIssueModel.aggregate.mockRejectedValue(new Error('boom'));

      await expect(service.getDashboardStats('token')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ---------------------------------------------------------------------
  // triggerClustering
  // ---------------------------------------------------------------------
  describe('triggerClustering', () => {
    it('should throw InternalServerErrorException when fewer than 2 issues have embeddings', async () => {
      const chain = makeChainable([{ _id: 'a', title: 't', embedding: [0.1] }]);
      mockIssueModel.find.mockReturnValue(chain);

      await expect(service.triggerClustering()).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should init the job and send chunks to the vector service', async () => {
      const issues = Array.from({ length: 3 }, (_, i) => ({
        _id: new Types.ObjectId(),
        title: `issue-${i}`,
        embedding: [0.1, 0.2],
      }));
      const chain = makeChainable(issues);
      mockIssueModel.find.mockReturnValue(chain);

      mockConsulClient.discoverService.mockResolvedValue(
        'http://vector-service',
      );
      mockHttpService.post
        .mockReturnValueOnce(of({ data: { job_id: 'job-1' } }))
        .mockReturnValueOnce(of({ data: {} }));

      const result = await service.triggerClustering();

      expect(result).toEqual({
        job_id: 'job-1',
        total_issues: 3,
        total_chunks: 1,
      });
      expect(mockHttpService.post).toHaveBeenCalledTimes(2);
    });

    it('should rethrow HttpException as-is', async () => {
      const issues = [
        { _id: new Types.ObjectId(), title: 'a', embedding: [0.1] },
        { _id: new Types.ObjectId(), title: 'b', embedding: [0.1] },
      ];
      const chain = makeChainable(issues);
      mockIssueModel.find.mockReturnValue(chain);
      mockConsulClient.discoverService.mockResolvedValue(
        'http://vector-service',
      );
      mockHttpService.post.mockReturnValue(
        throwError(() => new HttpException('bad request', 400)),
      );

      await expect(service.triggerClustering()).rejects.toThrow(HttpException);
    });
  });

  // ---------------------------------------------------------------------
  // saveClusterResults
  // ---------------------------------------------------------------------
  describe('saveClusterResults', () => {
    it('should bulk write updates and return modified count', async () => {
      mockIssueModel.bulkWrite.mockResolvedValue({
        modifiedCount: 2,
        matchedCount: 2,
      });

      const result = await service.saveClusterResults([
        {
          id: new Types.ObjectId().toString(),
          cluster_id: 0,
          cluster_label: 'A',
        },
      ] as any);

      expect(result).toEqual({ updated: 2 });
    });

    it('should wrap errors as InternalServerErrorException', async () => {
      mockIssueModel.bulkWrite.mockRejectedValue(new Error('boom'));

      await expect(
        service.saveClusterResults([
          {
            id: new Types.ObjectId().toString(),
            cluster_id: 0,
            cluster_label: 'A',
          },
        ] as any),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ---------------------------------------------------------------------
  // semanticSearch
  // ---------------------------------------------------------------------
  describe('semanticSearch', () => {
    it('should fall back to text-only mode when embedding fails', async () => {
      mockConsulClient.discoverService.mockResolvedValue(
        'http://vector-service',
      );
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('embed service down')),
      );

      const chain = makeChainable([
        {
          _id: new Types.ObjectId(),
          issueId: '1',
          title: 'Bug',
          body: 'body',
          state: 'open',
          url: 'https://x',
          embedding: null,
        },
      ]);
      mockIssueModel.find.mockReturnValue(chain);

      const result = await service.semanticSearch('user-1', {
        query: 'bug',
      } as any);

      expect(result.mode).toBe('text-only');
      expect(result.data[0].match_type).toBe('text');
    });

    it('should merge vector and text results, deduping vector matches', async () => {
      mockConsulClient.discoverService.mockResolvedValue(
        'http://vector-service',
      );
      mockHttpService.post.mockReturnValue(
        of({ data: { embedding: [0.1, 0.2] } }),
      );

      const sharedId = new Types.ObjectId();
      mockIssueModel.aggregate.mockResolvedValue([
        {
          _id: sharedId,
          issueId: '1',
          title: 'Vector hit',
          body: 'body',
          state: 'open',
          url: 'https://x',
          embedding: [0.1],
          similarity_score: 0.9,
        },
      ]);

      const chain = makeChainable([
        {
          _id: sharedId, // should be de-duped against vector result
          issueId: '1',
          title: 'Vector hit',
          body: 'body',
          state: 'open',
          url: 'https://x',
          embedding: [0.1],
        },
        {
          _id: new Types.ObjectId(),
          issueId: '2',
          title: 'Text-only hit',
          body: 'body',
          state: 'open',
          url: 'https://y',
          embedding: null,
        },
      ]);
      mockIssueModel.find.mockReturnValue(chain);

      const result = await service.semanticSearch('user-1', {
        query: 'bug',
      } as any);

      expect(result.mode).toBe('hybrid');
      expect(result.data).toHaveLength(2);
      expect(result.data[0].match_type).toBe('vector');
      expect(result.data[1].match_type).toBe('text');
    });

    it('should wrap unexpected errors as InternalServerErrorException', async () => {
      mockConsulClient.discoverService.mockRejectedValue(new Error('down'));
      mockIssueModel.find.mockImplementation(() => {
        throw new Error('boom');
      });

      await expect(
        service.semanticSearch('user-1', { query: 'bug' } as any),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ---------------------------------------------------------------------
  // getClusters
  // ---------------------------------------------------------------------
  describe('getClusters', () => {
    it('should scope by userId when the caller lacks the QA role', async () => {
      mockJwtService.decode.mockReturnValue({
        sub: 'user-1',
        realm_access: { roles: [] },
      });
      mockIssueModel.aggregate.mockResolvedValue([
        {
          data: [
            {
              _id: 0,
              cluster_label: 'Login',
              openCount: 2,
              closedCount: 1,
              totalCount: 3,
            },
          ],
          count: [{ total: 1 }],
        },
      ]);

      const result = await service.getClusters('token', 1, 6, '');

      expect(result.clusters[0]).toEqual({
        cluster_id: 0,
        cluster_label: 'Login',
        openCount: 2,
        closedCount: 1,
        gemini_summary: null,
      });
      expect(result.total).toBe(1);
    });

    it('should not scope by userId when the caller has the QA role', async () => {
      mockJwtService.decode.mockReturnValue({
        sub: 'user-1',
        realm_access: { roles: ['QA'] },
      });
      mockIssueModel.aggregate.mockResolvedValue([{ data: [], count: [] }]);

      await service.getClusters('token', 1, 6, '');

      const pipelineArg = mockIssueModel.aggregate.mock.calls[0][0];
      const matchStage = pipelineArg[0].$match;
      expect(matchStage.userId).toBeUndefined();
    });

    it('should wrap errors as InternalServerErrorException', async () => {
      mockJwtService.decode.mockReturnValue({ sub: 'user-1' });
      mockIssueModel.aggregate.mockRejectedValue(new Error('boom'));

      await expect(service.getClusters('token', 1, 6, '')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ---------------------------------------------------------------------
  // getDuplicateIssues
  // ---------------------------------------------------------------------
  describe('getDuplicateIssues', () => {
    it('should group near-duplicate issues within a cluster above the similarity threshold', async () => {
      mockJwtService.decode.mockReturnValue({ sub: 'user-1' });

      const chain = makeChainable([
        {
          _id: new Types.ObjectId(),
          issueId: '1',
          title: 'Issue A',
          state: 'open',
          url: 'https://x/1',
          created_at: new Date(),
          cluster_id: 0,
          cluster_label: 'Login',
          embedding: [1, 0],
          repo: 'org/repo',
        },
        {
          _id: new Types.ObjectId(),
          issueId: '2',
          title: 'Issue B (dup)',
          state: 'open',
          url: 'https://x/2',
          created_at: new Date(),
          cluster_id: 0,
          cluster_label: 'Login',
          embedding: [1, 0], // identical → similarity 1.0
          repo: 'org/repo',
        },
        {
          _id: new Types.ObjectId(),
          issueId: '3',
          title: 'Issue C (not a dup)',
          state: 'open',
          url: 'https://x/3',
          created_at: new Date(),
          cluster_id: 0,
          cluster_label: 'Login',
          embedding: [0, 1],
          repo: 'org/repo',
        },
      ]);
      mockIssueModel.find.mockReturnValue(chain);

      const result = await service.getDuplicateIssues('token');

      expect(result.duplicateGroups).toHaveLength(1);
      expect(result.duplicateGroups[0].issues).toHaveLength(2);
      expect(result.duplicateGroups[0].maxSimilarity).toBe(1);
    });

    it('should wrap errors as InternalServerErrorException', async () => {
      mockJwtService.decode.mockReturnValue({ sub: 'user-1' });
      mockIssueModel.find.mockImplementation(() => {
        throw new Error('boom');
      });

      await expect(service.getDuplicateIssues('token')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
