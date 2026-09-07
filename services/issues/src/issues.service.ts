import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Issue } from './issue.schema';
import { Model, PipelineStage, Types } from 'mongoose';
import { normalizeError } from './common/util/normalizedError.util';
import { ConsulClient } from './clients/consul.client';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { ClusterResultDto } from './dto/cluster-result.dto';
import { JwtService } from '@nestjs/jwt';
import {
  SearchedIssue,
  SearchIssuesDto,
  SemanticSearchResult,
} from './dto/search-issues.dto';
import {
  ClusterIssue,
  ClusterRepoItem,
  ClusterSummary,
} from './types/cluster.interface';
import {
  ChatCitation,
  ChatIssuesDto,
  ChatIssuesResult,
} from './dto/chat-issues.dto';
import { AgingBucket, QADashboardStats } from './types/qa-dashboard.interface';
import { DuplicateGroup } from './types/duplicate.interface';
import { extractRepo } from './common/util/extract-repo.util';

const CHUNK_SIZE = 1000;

export interface IssueDashboardStats {
  total: number;
  open: number;
  closed: number;
  clustered: number; // embedding != null && cluster_id >= 0
  noise: number; // embedding != null && cluster_id === -1
  poorlyDescribed: number; // embedding === null
  clusterDistribution: {
    cluster_id: number;
    cluster_label: string;
    openCount: number;
    closedCount: number;
  }[];
  recentIssues: {
    _id: string;
    title: string;
    state: string;
    cluster_id: number | null;
    cluster_label: string | null;
    created_at: Date | null;
    isPoorlyDescribed: boolean;
    isNoise: boolean;
  }[];
}

// ── Shared typed shapes ───────────────────────────────────────────────────

interface DecodedJwtPayload {
  sub: string;
  realm_access?: { roles?: string[] };
  [key: string]: unknown;
}

export interface CreateIssueDto {
  issueId: string | number;
  url: string;
  userId: string;
  state?: string;
  updated_at?: Date | string | null;
  title?: string;
  body?: string | null;
  created_at?: Date | string | null;
  embedding?: number[] | null;
  cluster_id?: number | null;
  cluster_label?: string | null;
  repo?: string | null;
}

export interface KafkaIssuePayload {
  issue: {
    id: string | number;
    number?: number;
    pull_request?: unknown;
    state: string;
    updated_at: Date | string;
    title: string;
    body?: string | null;
    created_at: Date | string;
    userId: string;
    url: string;
  };
}

interface EmbedApiResponse {
  embedding: number[];
}

interface RepoAggRow {
  _id: string;
  count: number;
}

interface StateCountRow {
  _id: string;
  count: number;
}

interface QualityFacetRow {
  poorlyDescribed: number;
  noise: number;
  clustered: number;
}

interface ClusterDistAggRow {
  _id: { cluster_id: number; cluster_label: string };
  counts: { state: string; count: number }[];
}

interface RecentIssueLean {
  _id: Types.ObjectId;
  title: string;
  state: string;
  cluster_id?: number | null;
  cluster_label?: string | null;
  created_at?: Date | null;
  embedding?: number[] | null;
}

interface VectorSearchHit {
  _id: Types.ObjectId;
  issueId: string;
  title: string;
  body?: string | null;
  state: string;
  cluster_id?: number | null;
  cluster_label?: string | null;
  created_at?: Date | string | null;
  updated_at?: Date | string | null;
  url: string;
  embedding?: number[] | null;
  similarity_score: number;
}

interface TextSearchLean {
  _id: Types.ObjectId;
  issueId: string;
  title: string;
  body?: string | null;
  state: string;
  cluster_id?: number | null;
  cluster_label?: string | null;
  created_at?: Date | string | null;
  updated_at?: Date | string | null;
  url: string;
  embedding?: number[] | null;
}

interface SearchIndexInfo {
  name: string;
  status: string;
  type: string;
  latestDefinition?: {
    fields?: unknown;
    mappings?: unknown;
  };
}

interface ClusterAggRow {
  _id: number;
  cluster_label: string;
  openCount: number;
  closedCount: number;
  totalCount: number;
}

interface ClusterReposAggRow {
  _id: string;
  count: number;
}

interface ClusterIssueLean {
  _id: Types.ObjectId;
  issueId: string;
  title: string;
  state: string;
  created_at?: Date | null;
  url: string;
}

interface SummarizeApiResponse {
  summary: string;
}

interface ChatRagApiResponse {
  answer: string;
  citations?: ChatCitation[];
}

interface QAQualityFacetRow {
  total: number;
  poorlyDescribed: number;
  noise: number;
  clustered: number;
  clusteredClosed: number;
}

interface QualityTrendAggRow {
  _id: string;
  poorlyDescribed: number;
  noise: number;
}

interface OpenIssueLean {
  _id: Types.ObjectId;
  issueId: string;
  title: string;
  created_at?: Date | null;
}

interface DuplicateIssueLean {
  _id: Types.ObjectId;
  issueId: string;
  title: string;
  state: string;
  url: string;
  created_at?: Date | null;
  cluster_id?: number | null;
  cluster_label?: string | null;
  embedding?: number[] | null;
  repo?: string | null;
}

@Injectable()
export class IssuesService {
  constructor(
    @InjectModel(Issue.name) private readonly issueModel: Model<Issue>,
    private readonly logger: Logger,
    private consulClient: ConsulClient,
    private readonly httpService: HttpService,
    private jwtService: JwtService,
  ) {}

  async createAndOverideOldOne(createIssueDto: CreateIssueDto): Promise<Issue> {
    try {
      const filter: Record<string, unknown> = {
        issueId: createIssueDto.issueId,
        url: createIssueDto.url,
        userId: createIssueDto.userId,
      };

      const updated = await this.issueModel.findOneAndUpdate(
        filter,
        { $set: createIssueDto },
        { upsert: true, new: true },
      );
      return updated as unknown as Issue;
    } catch (error) {
      this.logger.error(normalizeError(error));
      throw new InternalServerErrorException('Failed to create issue');
    }
  }

  async createFromKafkaPayload(payload: KafkaIssuePayload): Promise<void> {
    const { issue } = payload;
    if (issue?.pull_request) {
      this.logger.log(`Skipping pull request #${issue.number}`);
      return;
    }

    const { state, updated_at, title, body, created_at, userId, url } = issue;
    const repo = extractRepo(url);
    const safeBody = body ?? '';
    const wordCount = safeBody.trim().split(/\s+/).filter(Boolean).length;

    if (wordCount < 5) {
      this.logger.warn(
        `Issue ${issue.id} body contains less than 5 words (${wordCount}), skipping embedding`,
      );

      await this.createAndOverideOldOne({
        issueId: issue.id,
        state,
        updated_at,
        title,
        body,
        created_at,
        userId,
        embedding: null,
        cluster_id: null,
        cluster_label: null,
        url,
        repo,
      });

      return;
    }

    const vectorServiceInstanceUrl = await this.consulClient.discoverService(
      'vector-microservice',
    );
    const embeddingUrl = vectorServiceInstanceUrl + '/api/embed';
    const response = await firstValueFrom(
      this.httpService.post<EmbedApiResponse>(
        embeddingUrl,
        {
          issue_title: title,
          issue_body: body,
          issue_url: url,
        },
        {
          timeout: 120000,
        },
      ),
    );
    const embedding = response.data.embedding;

    const cleanIssue: CreateIssueDto = {
      issueId: issue.id,
      state,
      updated_at,
      title,
      body,
      created_at,
      userId,
      embedding,
      cluster_id: null,
      cluster_label: null,
      url,
      repo,
    };
    await this.createAndOverideOldOne(cleanIssue);
  }

  async findAll(
    page: number,
    limit: number,
    userId?: string,
    search?: string,
    state?: 'open' | 'closed' | 'all',
    repos?: string[],
  ): Promise<{ data: Issue[]; total: number }> {
    try {
      const filter: Record<string, unknown> = {};

      if (userId) filter.userId = userId;
      if (state && state !== 'all') filter.state = state;
      if (repos && repos.length > 0) filter.repo = { $in: repos };

      if (search?.trim()) {
        filter.$or = [
          { title: { $regex: search.trim(), $options: 'i' } },
          { repo: { $regex: search.trim(), $options: 'i' } },
        ];
      }

      const [data, total] = await Promise.all([
        this.issueModel
          .find(filter)
          .sort({ created_at: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean()
          .exec(),
        this.issueModel.countDocuments(filter),
      ]);

      return { data: data as Issue[], total };
    } catch (error) {
      this.logger.error(normalizeError(error));
      throw new InternalServerErrorException('Failed to fetch issues');
    }
  }

  async getRepos(
    search: string,
    page: number,
    limit: number,
  ): Promise<{ data: { repo: string; count: number }[]; total: number }> {
    try {
      const matchStage: Record<string, unknown> = { repo: { $ne: null } };

      const pipeline: PipelineStage[] = [
        { $match: matchStage },
        { $group: { _id: '$repo', count: { $sum: 1 } } },
      ];

      if (search?.trim()) {
        pipeline.push({
          $match: { _id: { $regex: search.trim(), $options: 'i' } },
        });
      }

      pipeline.push(
        { $sort: { count: -1, _id: 1 } },
        {
          $facet: {
            data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
            totalCount: [{ $count: 'count' }],
          },
        },
      );

      const [result] = await this.issueModel.aggregate<{
        data: RepoAggRow[];
        totalCount: { count: number }[];
      }>(pipeline);

      const data = (result?.data ?? []).map((r) => ({
        repo: r._id,
        count: r.count,
      }));
      const total = result?.totalCount?.[0]?.count ?? 0;

      return { data, total };
    } catch (error) {
      this.logger.error(normalizeError(error));
      throw new InternalServerErrorException('Failed to fetch repositories');
    }
  }

  /**
   * Returns all stats needed for the Software Engineer dashboard in one
   * aggregation pass. Scoped to the authenticated user's userId.
   *
   * Bucket logic (mirrors frontend logic exactly):
   *   poorlyDescribed → embedding is null or empty array
   *   noise           → embedding exists AND cluster_id === -1
   *   clustered       → embedding exists AND cluster_id >= 0
   */
  async getDashboardStats(token: string): Promise<IssueDashboardStats> {
    const payload = this.jwtService.decode<DecodedJwtPayload>(token);
    const authUserId = payload.sub;

    try {
      const userId = { userId: authUserId };

      // ── 1. Single aggregation for all scalar counts ──────────────────────
      const [countsResult] = await this.issueModel.aggregate<{
        totals: StateCountRow[];
        quality: QualityFacetRow[];
      }>([
        { $match: userId },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: '$state',
                  count: { $sum: 1 },
                },
              },
            ],
            quality: [
              {
                $group: {
                  _id: null,
                  poorlyDescribed: {
                    $sum: {
                      $cond: [
                        {
                          $or: [
                            { $eq: ['$embedding', null] },
                            {
                              $eq: [
                                { $size: { $ifNull: ['$embedding', []] } },
                                0,
                              ],
                            },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  noise: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $ne: ['$embedding', null] },
                            {
                              $gt: [
                                { $size: { $ifNull: ['$embedding', []] } },
                                0,
                              ],
                            },
                            { $eq: ['$cluster_id', -1] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  clustered: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $ne: ['$embedding', null] },
                            {
                              $gt: [
                                { $size: { $ifNull: ['$embedding', []] } },
                                0,
                              ],
                            },
                            { $gte: ['$cluster_id', 0] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      ]);

      // Parse totals facet
      const totalsArr: StateCountRow[] = countsResult?.totals ?? [];
      const openCount = totalsArr.find((t) => t._id === 'open')?.count ?? 0;
      const closedCount = totalsArr.find((t) => t._id === 'closed')?.count ?? 0;
      const total = openCount + closedCount;

      // Parse quality facet
      const quality: QualityFacetRow = countsResult?.quality?.[0] ?? {
        poorlyDescribed: 0,
        noise: 0,
        clustered: 0,
      };

      // ── 2. Cluster distribution (open issues per cluster label) ───────────
      const clusterDistributionRaw =
        await this.issueModel.aggregate<ClusterDistAggRow>([
          {
            $match: {
              ...userId,
              embedding: { $ne: null },
              'embedding.0': { $exists: true },
              cluster_id: { $gte: 0 },
              cluster_label: { $ne: null },
            },
          },
          {
            $group: {
              _id: {
                cluster_id: '$cluster_id',
                cluster_label: '$cluster_label',
                state: '$state',
              },
              count: { $sum: 1 },
            },
          },
          {
            $group: {
              _id: {
                cluster_id: '$_id.cluster_id',
                cluster_label: '$_id.cluster_label',
              },
              counts: {
                $push: { state: '$_id.state', count: '$count' },
              },
            },
          },
          { $sort: { '_id.cluster_id': 1 } },
        ]);

      const clusterDistribution = clusterDistributionRaw.map((c) => {
        const openC = c.counts.find((s) => s.state === 'open')?.count ?? 0;
        const closedC = c.counts.find((s) => s.state === 'closed')?.count ?? 0;
        return {
          cluster_id: c._id.cluster_id,
          cluster_label: c._id.cluster_label,
          openCount: openC,
          closedCount: closedC,
        };
      });

      // ── 3. Recent issues list (last 20, all categories) ──────────────────
      const recentRaw = (await this.issueModel
        .find(userId)
        .select('_id title state cluster_id cluster_label created_at embedding')
        .sort({ created_at: -1 })
        .limit(20)
        .lean()
        .exec()) as unknown as RecentIssueLean[];

      const recentIssues = recentRaw.map((i) => {
        const hasEmbedding =
          i.embedding !== null &&
          Array.isArray(i.embedding) &&
          i.embedding.length > 0;
        return {
          _id: i._id.toString(),
          title: i.title,
          state: i.state,
          cluster_id: i.cluster_id ?? null,
          cluster_label: i.cluster_label ?? null,
          created_at: i.created_at ?? null,
          isPoorlyDescribed: !hasEmbedding,
          isNoise: hasEmbedding && i.cluster_id === -1,
        };
      });

      return {
        total,
        open: openCount,
        closed: closedCount,
        clustered: quality.clustered,
        noise: quality.noise,
        poorlyDescribed: quality.poorlyDescribed,
        clusterDistribution,
        recentIssues,
      };
    } catch (error) {
      this.logger.error(normalizeError(error));
      throw new InternalServerErrorException('Failed to fetch dashboard stats');
    }
  }

  async triggerClustering(): Promise<{
    job_id: string;
    total_issues: number;
    total_chunks: number;
  }> {
    try {
      const issues = (await this.issueModel
        .find({
          embedding: { $exists: true, $ne: null },
          'embedding.0': { $exists: true },
        })
        .select('_id title embedding')
        .lean()
        .exec()) as unknown as {
        _id: Types.ObjectId;
        title: string;
        embedding: number[];
      }[];

      if (issues.length < 2) {
        throw new InternalServerErrorException(
          'Not enough issues with embeddings to cluster (minimum 2).',
        );
      }

      const totalIssues = issues.length;
      const totalChunks = Math.ceil(totalIssues / CHUNK_SIZE);

      this.logger.log(
        `Clustering triggered: ${totalIssues} issues → ${totalChunks} chunks of ${CHUNK_SIZE}`,
      );

      const vectorServiceUrl = await this.consulClient.discoverService(
        'vector-microservice',
      );

      const initResponse = await firstValueFrom(
        this.httpService.post<{ job_id: string }>(
          `${vectorServiceUrl}/api/cluster/init`,
          { total_issues: totalIssues, total_chunks: totalChunks },
          { timeout: 30000 },
        ),
      );

      const { job_id } = initResponse.data;
      this.logger.log(`Cluster job initialized: job_id=${job_id}`);

      for (let i = 0; i < totalChunks; i++) {
        const chunk = issues.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);

        const chunkPayload = {
          chunk_index: i,
          issues: chunk.map((issue) => ({
            id: issue._id.toString(),
            issue_title: issue.title,
            embedding: issue.embedding,
          })),
        };

        await firstValueFrom(
          this.httpService.post(
            `${vectorServiceUrl}/api/cluster/chunk/${job_id}`,
            chunkPayload,
            { timeout: 60000 },
          ),
        );

        this.logger.log(`Chunk ${i + 1}/${totalChunks} sent for job ${job_id}`);
      }

      return { job_id, total_issues: totalIssues, total_chunks: totalChunks };
    } catch (error) {
      this.logger.error(normalizeError(error));
      if (error instanceof HttpException) throw error;
      const err = error as { status?: number; message?: string };
      if (err?.status) throw new HttpException(err.message ?? '', err.status);
      throw new InternalServerErrorException(
        err?.message || 'Failed to trigger clustering',
      );
    }
  }

  async saveClusterResults(
    results: ClusterResultDto[],
  ): Promise<{ updated: number }> {
    try {
      const ops = results.map((r) => ({
        updateOne: {
          filter: { _id: new Types.ObjectId(r.id) },
          update: {
            $set: { cluster_id: r.cluster_id, cluster_label: r.cluster_label },
          },
        },
      }));

      const result = await this.issueModel.bulkWrite(ops, { ordered: false });

      this.logger.log(
        `Cluster results saved: ${result.modifiedCount} modified, ${result.matchedCount} matched.`,
      );

      return { updated: result.modifiedCount };
    } catch (error) {
      this.logger.error(normalizeError(error));
      throw new InternalServerErrorException('Failed to save cluster results');
    }
  }

  async semanticSearch(
    userId: string,
    dto: SearchIssuesDto,
  ): Promise<SemanticSearchResult> {
    const { query, state, limit = 20, page = 1 } = dto;
    const SIMILARITY_THRESHOLD = 0.55;
    const skip = (page - 1) * limit;

    const baseFilter: Record<string, unknown> = {};
    if (state && state !== 'all') baseFilter.state = state;

    try {
      let queryEmbedding: number[] | null = null;
      let mode: 'hybrid' | 'text-only' = 'text-only';

      try {
        const vectorServiceUrl = await this.consulClient.discoverService(
          'vector-microservice',
        );
        const embedResponse = await firstValueFrom(
          this.httpService.post<EmbedApiResponse>(
            `${vectorServiceUrl}/api/search/embed`,
            { query },
            { timeout: 10000 },
          ),
        );
        queryEmbedding = embedResponse.data.embedding;
        mode = 'hybrid';
      } catch (embedErr) {
        this.logger.warn(
          `Failed to get query embedding, falling back to text search: ${embedErr}`,
        );
      }

      let vectorResults: VectorSearchHit[] = [];

      if (queryEmbedding) {
        const vectorFilter: Record<string, unknown> = {};
        if (state && state !== 'all') vectorFilter.state = state;

        // $vectorSearch is an Atlas-only stage that mongoose's PipelineStage
        // union doesn't model, so this pipeline stays loosely typed.

        vectorResults = await this.issueModel.aggregate<VectorSearchHit>([
          {
            $vectorSearch: {
              index: 'vector_index',
              path: 'embedding',
              queryVector: queryEmbedding,
              numCandidates: limit * 10,
              limit: limit * 2,
              filter: vectorFilter,
            },
          },
          {
            $addFields: {
              similarity_score: { $meta: 'vectorSearchScore' },
            },
          },
          {
            $match: {
              similarity_score: { $gte: SIMILARITY_THRESHOLD },
            },
          },
          {
            $project: {
              _id: 1,
              issueId: 1,
              title: 1,
              body: 1,
              state: 1,
              cluster_id: 1,
              cluster_label: 1,
              created_at: 1,
              updated_at: 1,
              url: 1,
              embedding: 1,
              similarity_score: 1,
            },
          },
        ] as PipelineStage[]);
      }

      const vectorMatchedIds = new Set(
        vectorResults.map((r) => r._id.toString()),
      );

      const textFilter: Record<string, unknown> = {
        ...baseFilter,
        $or: [
          { title: { $regex: query.trim(), $options: 'i' } },
          { body: { $regex: query.trim(), $options: 'i' } },
        ],
      };

      const textResults = (await this.issueModel

        .find(textFilter)
        .select(
          '_id issueId title body state cluster_id cluster_label created_at updated_at url embedding',
        )
        .sort({ created_at: -1 })
        .limit(limit * 2)
        .lean()
        .exec()) as unknown as TextSearchLean[];

      const merged: SearchedIssue[] = [];

      for (const r of vectorResults) {
        const hasEmbedding =
          r.embedding !== null &&
          Array.isArray(r.embedding) &&
          r.embedding.length > 0;

        merged.push({
          _id: r._id.toString(),
          issueId: r.issueId,
          title: r.title,
          body: r.body,
          state: r.state,
          cluster_id: r.cluster_id ?? null,
          cluster_label: r.cluster_label ?? null,
          created_at: r.created_at ?? null,
          updated_at: r.updated_at ?? null,
          url: r.url,
          similarity_score: Math.round(r.similarity_score * 100) / 100,
          isPoorlyDescribed: !hasEmbedding,
          isNoise: hasEmbedding && r.cluster_id === -1,
          match_type: 'vector',
        });
      }

      for (const r of textResults) {
        if (vectorMatchedIds.has(r._id.toString())) continue;

        const hasEmbedding =
          r.embedding !== null &&
          Array.isArray(r.embedding) &&
          r.embedding.length > 0;

        merged.push({
          _id: r._id.toString(),
          issueId: r.issueId,
          title: r.title,
          body: r.body ?? '',
          state: r.state,
          cluster_id: r.cluster_id ?? null,
          cluster_label: r.cluster_label ?? null,
          created_at: r.created_at
            ? new Date(r.created_at).toISOString()
            : null,
          updated_at: r.updated_at
            ? new Date(r.updated_at).toISOString()
            : null,
          url: r.url,
          similarity_score: null,
          isPoorlyDescribed: !hasEmbedding,
          isNoise: hasEmbedding && r.cluster_id === -1,
          match_type: 'text',
        });
      }

      const total = merged.length;
      const paginated = merged.slice(skip, skip + limit);

      return { data: paginated, total, query, mode };
    } catch (error) {
      this.logger.error(normalizeError(error));
      throw new InternalServerErrorException('Semantic search failed');
    }
  }

  async semanticSearchQAChat(
    dto: SearchIssuesDto,
  ): Promise<SemanticSearchResult> {
    const { query, state, limit = 20, page = 1 } = dto;
    const SIMILARITY_THRESHOLD = 0.55;
    const skip = (page - 1) * limit;
    const baseFilter: Record<string, unknown> = {};
    if (state && state !== 'all') baseFilter.state = state;

    try {
      const indexes = (await this.issueModel.collection
        .listSearchIndexes()
        .toArray()) as unknown as SearchIndexInfo[];
      this.logger.log(
        `Search indexes: ${JSON.stringify(
          indexes.map((idx) => ({
            name: idx.name,
            status: idx.status,
            type: idx.type,
            fields:
              idx.latestDefinition?.fields ?? idx.latestDefinition?.mappings,
          })),
        )}`,
      );
    } catch (idxErr) {
      this.logger.warn(`Could not list search indexes: ${idxErr}`);
    }

    try {
      let queryEmbedding: number[] | null = null;
      let mode: 'hybrid' | 'text-only' = 'text-only';

      try {
        const vectorServiceUrl = await this.consulClient.discoverService(
          'vector-microservice',
        );
        const embedResponse = await firstValueFrom(
          this.httpService.post<EmbedApiResponse>(
            `${vectorServiceUrl}/api/search/embed`,
            { query },
            { timeout: 10000 },
          ),
        );
        queryEmbedding = embedResponse.data.embedding;
        mode = 'hybrid';
      } catch (embedErr) {
        this.logger.warn(
          `Failed to get query embedding, falling back to text search: ${embedErr}`,
        );
      }

      let vectorResults: VectorSearchHit[] = [];

      if (queryEmbedding) {
        const vectorSearchStage: {
          index: string;
          path: string;
          queryVector: number[];
          numCandidates: number;
          limit: number;
          filter?: Record<string, unknown>;
        } = {
          index: 'vector_index',
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: Math.max(limit * 20, 200),
          limit: limit * 3,
        };

        if (state && state !== 'all') {
          vectorSearchStage.filter = { state };
        }

        vectorResults = await this.issueModel.aggregate<VectorSearchHit>([
          { $vectorSearch: vectorSearchStage },
          {
            $addFields: {
              similarity_score: { $meta: 'vectorSearchScore' },
            },
          },
          {
            $match: {
              similarity_score: { $gte: SIMILARITY_THRESHOLD },
            },
          },
          {
            $project: {
              _id: 1,
              issueId: 1,
              title: 1,
              body: 1,
              state: 1,
              cluster_id: 1,
              cluster_label: 1,
              created_at: 1,
              updated_at: 1,
              url: 1,
              embedding: 1,
              similarity_score: 1,
            },
          },
        ] as PipelineStage[]);

        this.logger.log(
          `RAG vector search: ${vectorResults.length} results above threshold ${SIMILARITY_THRESHOLD}`,
        );
      }

      const vectorMatchedIds = new Set(
        vectorResults.map((r) => r._id.toString()),
      );

      const textFilter: Record<string, unknown> = {
        ...baseFilter,
        $or: [
          { title: { $regex: query.trim(), $options: 'i' } },
          { body: { $regex: query.trim(), $options: 'i' } },
        ],
      };

      const textResults = (await this.issueModel

        .find(textFilter)
        .select(
          '_id issueId title body state cluster_id cluster_label created_at updated_at url embedding',
        )
        .sort({ created_at: -1 })
        .limit(limit * 2)
        .lean()
        .exec()) as unknown as TextSearchLean[];

      this.logger.log(`RAG text search: ${textResults.length} results`);

      const merged: SearchedIssue[] = [];

      for (const r of vectorResults) {
        const hasEmbedding =
          r.embedding !== null &&
          Array.isArray(r.embedding) &&
          r.embedding.length > 0;

        merged.push({
          _id: r._id.toString(),
          issueId: r.issueId,
          title: r.title,
          body: r.body,
          state: r.state,
          cluster_id: r.cluster_id ?? null,
          cluster_label: r.cluster_label ?? null,
          created_at: r.created_at ?? null,
          updated_at: r.updated_at ?? null,
          url: r.url,
          similarity_score: Math.round(r.similarity_score * 100) / 100,
          isPoorlyDescribed: !hasEmbedding,
          isNoise: hasEmbedding && r.cluster_id === -1,
          match_type: 'vector',
        });
      }

      for (const r of textResults) {
        if (vectorMatchedIds.has(r._id.toString())) continue;

        const hasEmbedding =
          r.embedding !== null &&
          Array.isArray(r.embedding) &&
          r.embedding.length > 0;

        merged.push({
          _id: r._id.toString(),
          issueId: r.issueId,
          title: r.title,
          body: r.body ?? '',
          state: r.state,
          cluster_id: r.cluster_id ?? null,
          cluster_label: r.cluster_label ?? null,
          created_at: r.created_at
            ? new Date(r.created_at).toISOString()
            : null,
          updated_at: r.updated_at
            ? new Date(r.updated_at).toISOString()
            : null,
          url: r.url,
          similarity_score: null,
          isPoorlyDescribed: !hasEmbedding,
          isNoise: hasEmbedding && r.cluster_id === -1,
          match_type: 'text',
        });
      }

      const total = merged.length;
      const paginated = merged.slice(skip, skip + limit);

      return { data: paginated, total, query, mode };
    } catch (error) {
      this.logger.error(normalizeError(error));
      throw new InternalServerErrorException('Semantic search failed');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /issues/clusters?page=&limit=6&search=
  // Paginated, searchable, lightweight cluster metadata (no embedded issues).
  // ─────────────────────────────────────────────────────────────────────────────
  async getClusters(
    token: string,
    page: number,
    limit: number,
    search: string,
  ): Promise<{ clusters: ClusterSummary[]; total: number }> {
    const payload = this.jwtService.decode<DecodedJwtPayload>(token);
    const hasQaRole = payload.realm_access?.roles?.includes('QA') ?? false;
    const userId = payload.sub;

    try {
      const matchStage: Record<string, unknown> = {
        cluster_id: { $gte: 0 },
        embedding: { $ne: null },
        cluster_label: { $ne: null },
      };
      if (!hasQaRole) matchStage.userId = userId;

      const pipeline: PipelineStage[] = [
        { $match: matchStage },
        {
          $group: {
            _id: '$cluster_id',
            cluster_label: { $first: '$cluster_label' },
            openCount: { $sum: { $cond: [{ $eq: ['$state', 'open'] }, 1, 0] } },
            closedCount: {
              $sum: { $cond: [{ $eq: ['$state', 'closed'] }, 1, 0] },
            },
          },
        },
        {
          $addFields: {
            totalCount: { $add: ['$openCount', '$closedCount'] },
          },
        },
      ];

      if (search?.trim()) {
        pipeline.push({
          $match: { cluster_label: { $regex: search.trim(), $options: 'i' } },
        });
      }

      pipeline.push(
        { $sort: { totalCount: -1, _id: 1 } },
        {
          $facet: {
            data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
            count: [{ $count: 'total' }],
          },
        },
      );

      const [result] = await this.issueModel.aggregate<{
        data: ClusterAggRow[];
        count: { total: number }[];
      }>(pipeline);

      const clusters: ClusterSummary[] = (result?.data ?? []).map((c) => ({
        cluster_id: c._id,
        cluster_label: c.cluster_label,
        openCount: c.openCount,
        closedCount: c.closedCount,
        gemini_summary: null,
      }));
      const total = result?.count?.[0]?.total ?? 0;

      return { clusters, total };
    } catch (error) {
      this.logger.error(normalizeError(error));
      throw new InternalServerErrorException('Failed to fetch clusters');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /issues/clusters/:cluster_id/repos?page=&limit=8
  // ─────────────────────────────────────────────────────────────────────────────
  async getClusterRepos(
    token: string,
    clusterId: number,
    page: number,
    limit: number,
  ): Promise<{ data: ClusterRepoItem[]; total: number }> {
    const payload = this.jwtService.decode<DecodedJwtPayload>(token);
    const hasQaRole = payload.realm_access?.roles?.includes('QA') ?? false;
    const userId = payload.sub;

    try {
      const matchStage: Record<string, unknown> = {
        cluster_id: clusterId,
        embedding: { $ne: null },
        repo: { $ne: null },
      };
      if (!hasQaRole) matchStage.userId = userId;

      const pipeline: PipelineStage[] = [
        { $match: matchStage },
        { $group: { _id: '$repo', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        {
          $facet: {
            data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
            count: [{ $count: 'total' }],
          },
        },
      ];

      const [result] = await this.issueModel.aggregate<{
        data: ClusterReposAggRow[];
        count: { total: number }[];
      }>(pipeline);

      const data: ClusterRepoItem[] = (result?.data ?? []).map((r) => ({
        repo: r._id,
        count: r.count,
      }));
      const total = result?.count?.[0]?.total ?? 0;

      return { data, total };
    } catch (error) {
      this.logger.error(normalizeError(error));
      throw new InternalServerErrorException(
        'Failed to fetch cluster repositories',
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /issues/clusters/:cluster_id/issues?repo=&page=&limit=20
  // ─────────────────────────────────────────────────────────────────────────────
  async getClusterRepoIssues(
    token: string,
    clusterId: number,
    repo: string,
    page: number,
    limit: number,
  ): Promise<{ data: ClusterIssue[]; total: number }> {
    const payload = this.jwtService.decode<DecodedJwtPayload>(token);
    const hasQaRole = payload.realm_access?.roles?.includes('QA') ?? false;
    const userId = payload.sub;

    try {
      const filter: Record<string, unknown> = { cluster_id: clusterId, repo };
      if (!hasQaRole) filter.userId = userId;

      const [rows, total] = await Promise.all([
        this.issueModel

          .find(filter)
          .select('_id issueId title state created_at url')
          .sort({ created_at: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean()
          .exec() as unknown as Promise<ClusterIssueLean[]>,
        this.issueModel.countDocuments(filter),
      ]);

      const data: ClusterIssue[] = rows.map((i) => ({
        _id: i._id.toString(),
        issueId: i.issueId,
        title: i.title,
        state: i.state as 'open' | 'closed',
        created_at: i.created_at ? i.created_at.toISOString() : null,
        url: i.url,
      }));

      return { data, total };
    } catch (error) {
      this.logger.error(normalizeError(error));
      throw new InternalServerErrorException('Failed to fetch cluster issues');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /issues/clusters/:cluster_id/summarize
  // ─────────────────────────────────────────────────────────────────────────────
  async summarizeCluster(
    token: string,
    clusterId: number,
  ): Promise<{ summary: string }> {
    const payload = this.jwtService.decode<DecodedJwtPayload>(token);
    const userId = payload.sub;
    const issues = await this.issueModel
      .find({
        userId,
        cluster_id: clusterId,
        embedding: { $ne: null },
      })
      .select('title body cluster_label')
      .lean()
      .exec();

    if (issues.length === 0) {
      throw new Error(`No issues found for cluster ${clusterId}`);
    }

    const clusterLabel = issues[0].cluster_label ?? `Cluster ${clusterId}`;

    const issueSnippets = issues.map((iss, i) => {
      const body = (iss.body ?? '').slice(0, 300).replace(/\n+/g, ' ').trim();
      return `${i + 1}. [${iss.title}]${body ? ': ' + body : ''}`;
    });

    const fastApiUrl = process.env.FASTAPI_URL ?? 'http://localhost:8000';

    const res = await fetch(`${fastApiUrl}/api/summarize-cluster`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cluster_id: clusterId,
        cluster_label: clusterLabel,
        issues: issueSnippets,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`FastAPI summarize failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as SummarizeApiResponse;
    return { summary: data.summary };
  }

  /**
   * RAG chat: retrieves relevant issues via the existing hybrid
   * semanticSearch, then delegates answer generation to FastAPI/Gemini.
   */
  async chatWithIssues(
    userId: string,
    dto: ChatIssuesDto,
  ): Promise<ChatIssuesResult> {
    const RETRIEVAL_LIMIT = 8;

    try {
      const searchResult = await this.semanticSearchQAChat({
        query: dto.query,
        state: 'all',
        limit: RETRIEVAL_LIMIT,
        page: 1,
      });

      this.logger.log(
        `RAG retrieval: ${searchResult.data.length} issues found for query "${dto.query}"`,
      );

      const issuesContext = searchResult.data.map((issue) => ({
        id: issue._id,
        issueId: issue.issueId ?? issue._id,
        title: issue.title,
        body: issue.body ?? '',
        url: issue.url,
        state: issue.state,
        cluster_label: issue.cluster_label ?? null,
      }));

      const fastApiUrl = process.env.FASTAPI_URL ?? 'http://localhost:8000/api';

      const res = await fetch(`${fastApiUrl}/chat-rag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: dto.query,
          history: dto.history ?? [],
          issues: issuesContext,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`FastAPI chat-rag failed (${res.status}): ${text}`);
      }

      const data = (await res.json()) as ChatRagApiResponse;
      return { answer: data.answer, citations: data.citations ?? [] };
    } catch (error) {
      this.logger.error(normalizeError(error));
      throw new InternalServerErrorException(
        'Failed to generate chat response',
      );
    }
  }

  async getQADashboardStats(token: string): Promise<QADashboardStats> {
    // Token currently unused for scoping (QA dashboard is global), kept for
    // future auth/audit use — decode without binding an unused variable.
    this.jwtService.decode<DecodedJwtPayload>(token);

    try {
      const [countsResult] = await this.issueModel.aggregate<{
        quality: QAQualityFacetRow[];
      }>([
        {
          $facet: {
            quality: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  poorlyDescribed: {
                    $sum: {
                      $cond: [
                        {
                          $or: [
                            { $eq: ['$embedding', null] },
                            {
                              $eq: [
                                { $size: { $ifNull: ['$embedding', []] } },
                                0,
                              ],
                            },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  noise: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $ne: ['$embedding', null] },
                            {
                              $gt: [
                                { $size: { $ifNull: ['$embedding', []] } },
                                0,
                              ],
                            },
                            { $eq: ['$cluster_id', -1] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  clustered: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $ne: ['$embedding', null] },
                            {
                              $gt: [
                                { $size: { $ifNull: ['$embedding', []] } },
                                0,
                              ],
                            },
                            { $gte: ['$cluster_id', 0] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  clusteredClosed: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $ne: ['$embedding', null] },
                            {
                              $gt: [
                                { $size: { $ifNull: ['$embedding', []] } },
                                0,
                              ],
                            },
                            { $gte: ['$cluster_id', 0] },
                            { $eq: ['$state', 'closed'] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      ]);

      const q: QAQualityFacetRow = countsResult?.quality?.[0] ?? {
        total: 0,
        poorlyDescribed: 0,
        noise: 0,
        clustered: 0,
        clusteredClosed: 0,
      };
      const resolutionRate =
        q.clustered > 0
          ? Math.round((q.clusteredClosed / q.clustered) * 100)
          : 0;

      // ── quality trend: poorlyDescribed/noise grouped by ISO week, last 8 weeks ──
      const eightWeeksAgo = new Date();
      eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

      const trendRaw = await this.issueModel.aggregate<QualityTrendAggRow>([
        {
          $match: {
            created_at: { $gte: eightWeeksAgo },
            $or: [
              { embedding: null },
              { 'embedding.0': { $exists: false } },
              { cluster_id: -1 },
            ],
          },
        },
        {
          $addFields: {
            isPoorlyDescribed: {
              $or: [
                { $eq: ['$embedding', null] },
                { $eq: [{ $size: { $ifNull: ['$embedding', []] } }, 0] },
              ],
            },
            period: {
              $dateToString: { format: '%G-W%V', date: '$created_at' },
            },
          },
        },
        {
          $group: {
            _id: '$period',
            poorlyDescribed: { $sum: { $cond: ['$isPoorlyDescribed', 1, 0] } },
            noise: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$isPoorlyDescribed', false] },
                      { $eq: ['$cluster_id', -1] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      const qualityTrend = trendRaw.map((t) => ({
        period: t._id,
        poorlyDescribed: t.poorlyDescribed,
        noise: t.noise,
      }));

      // ── aging buckets for OPEN issues only ──────────────────────────────────
      const now = new Date();
      const openIssues = (await this.issueModel
        .find({ state: 'open' })
        .select('_id issueId title created_at')
        .lean()
        .exec()) as unknown as OpenIssueLean[];

      const buckets = { '0-7': 0, '7-30': 0, '30+': 0 };
      const withAge = openIssues.map((i) => {
        const days = i.created_at
          ? Math.floor(
              (now.getTime() - new Date(i.created_at).getTime()) / 86400000,
            )
          : 0;
        if (days <= 7) buckets['0-7']++;
        else if (days <= 30) buckets['7-30']++;
        else buckets['30+']++;
        return { ...i, daysOpen: days };
      });

      const agingBuckets: AgingBucket[] = [
        { bucket: '0-7', count: buckets['0-7'] },
        { bucket: '7-30', count: buckets['7-30'] },
        { bucket: '30+', count: buckets['30+'] },
      ];

      const oldestOpenIssues = withAge
        .sort((a, b) => b.daysOpen - a.daysOpen)
        .slice(0, 6)
        .map((i) => ({
          _id: i._id.toString(),
          issueId: i.issueId,
          title: i.title,
          created_at: i.created_at ?? null,
          daysOpen: i.daysOpen,
        }));

      return {
        total: q.total,
        poorlyDescribed: q.poorlyDescribed,
        noise: q.noise,
        clustered: q.clustered,
        resolutionRate,
        qualityTrend,
        agingBuckets,
        oldestOpenIssues,
      };
    } catch (error) {
      this.logger.error(normalizeError(error));
      throw new InternalServerErrorException(
        'Failed to fetch QA dashboard stats',
      );
    }
  }

  private cosineSim(a: number[], b: number[]): number {
    // embeddings are L2-normalized at embed time, so dot product == cosine similarity
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /issues/duplicates
  // Flags near-duplicate issues (cosine similarity >= 0.85) within each cluster.
  // ─────────────────────────────────────────────────────────────────────────────
  async getDuplicateIssues(
    token: string,
  ): Promise<{ duplicateGroups: DuplicateGroup[] }> {
    // Token currently unused for scoping (duplicates are global), kept for
    // future auth/audit use — decode without binding an unused variable.
    this.jwtService.decode<DecodedJwtPayload>(token);
    const SIMILARITY_THRESHOLD = 0.98;

    try {
      const issues = (await this.issueModel
        .find({
          cluster_id: { $gte: 0 },
          embedding: { $ne: null },
          'embedding.0': { $exists: true },
        })
        .select(
          '_id issueId title state url created_at cluster_id cluster_label embedding repo',
        )
        .lean()
        .exec()) as unknown as DuplicateIssueLean[];

      const byCluster = new Map<number, DuplicateIssueLean[]>();
      for (const issue of issues) {
        const clusterId = issue.cluster_id as number;
        const arr = byCluster.get(clusterId) ?? [];
        arr.push(issue);
        byCluster.set(clusterId, arr);
      }

      const duplicateGroups: DuplicateGroup[] = [];

      for (const [clusterId, clusterIssues] of byCluster) {
        const n = clusterIssues.length;
        if (n < 2) continue;

        const parent: number[] = Array.from({ length: n }, (_, i) => i);
        const find = (x: number): number =>
          parent[x] === x ? x : (parent[x] = find(parent[x]));
        const union = (a: number, b: number) => {
          const ra = find(a),
            rb = find(b);
          if (ra !== rb) parent[ra] = rb;
        };

        const pairSims: number[][] = Array.from({ length: n }, () =>
          new Array<number>(n).fill(0),
        );

        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const sim = this.cosineSim(
              clusterIssues[i].embedding as number[],
              clusterIssues[j].embedding as number[],
            );
            pairSims[i][j] = sim;
            if (sim >= SIMILARITY_THRESHOLD) union(i, j);
          }
        }

        const groupsMap = new Map<number, number[]>();
        for (let i = 0; i < n; i++) {
          const root = find(i);
          const arr = groupsMap.get(root) ?? [];
          arr.push(i);
          groupsMap.set(root, arr);
        }

        for (const indices of groupsMap.values()) {
          if (indices.length < 2) continue;

          let maxSim = 0;
          for (let a = 0; a < indices.length; a++) {
            for (let b = a + 1; b < indices.length; b++) {
              const [lo, hi] = [
                Math.min(indices[a], indices[b]),
                Math.max(indices[a], indices[b]),
              ];
              maxSim = Math.max(maxSim, pairSims[lo][hi]);
            }
          }

          duplicateGroups.push({
            groupId: `${clusterId}-${indices.join('-')}`,
            cluster_id: clusterId,
            cluster_label: clusterIssues[0].cluster_label as string,
            maxSimilarity: Math.round(maxSim * 100) / 100,
            issues: indices.map((idx) => {
              const iss = clusterIssues[idx];
              return {
                _id: iss._id.toString(),
                issueId: iss.issueId,
                title: iss.title,
                state: iss.state as 'open' | 'closed',
                url: iss.url,
                created_at: iss.created_at
                  ? iss.created_at.toISOString()
                  : null,
                repo: iss.repo ?? null,
              };
            }),
          });
        }
      }

      duplicateGroups.sort((a, b) => b.maxSimilarity - a.maxSimilarity);
      return { duplicateGroups };
    } catch (error) {
      this.logger.error(normalizeError(error));
      throw new InternalServerErrorException(
        'Failed to detect duplicate issues',
      );
    }
  }
}
