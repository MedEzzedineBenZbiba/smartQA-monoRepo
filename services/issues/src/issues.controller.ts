import {
  Controller,
  Get,
  Logger,
  Request,
  Query,
  Post,
  Param,
} from '@nestjs/common';
import { ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import * as issuesService_1 from './issues.service';

import {
  Ctx,
  KafkaContext,
  MessagePattern,
  Payload,
} from '@nestjs/microservices';
import { Body } from '@nestjs/common';
import { ClusterResultDto } from './dto/cluster-result.dto';
import { KAFKA_TOPICS } from './constants/kafka.constants';
import { SearchIssuesDto, SemanticSearchResult } from './dto/search-issues.dto';
import {
  ClusterIssue,
  ClusterRepoItem,
  ClusterSummary,
} from './types/cluster.interface';
import { ChatIssuesDto, ChatIssuesResult } from './dto/chat-issues.dto';
import { DuplicateGroup } from './types/duplicate.interface';
import { Issue } from './issue.schema';
import * as kafkaPayloadInterface from './types/kafkaPayload.interface';

// ── Shared request typing ──────────────────────────────────────────────────
// Express's Request extended with what our auth middleware/guard attaches.
interface AuthenticatedRequest {
  headers: {
    authorization?: string;
    [key: string]: unknown;
  };
  user?: {
    sub?: string;
    userId?: string;
    [key: string]: unknown;
  };
}

function extractToken(req: AuthenticatedRequest): string | undefined {
  return req.headers.authorization?.split(' ')[1];
}

function extractUserId(req: AuthenticatedRequest): string | undefined {
  return req.user?.sub ?? req.user?.userId;
}

@Controller('issues')
export class IssuesController {
  constructor(
    private readonly issuesService: issuesService_1.IssuesService,
    private readonly logger: Logger,
  ) {}

  @Get('check')
  healthCheck() {
    return { status: 'ok' };
  }

  @MessagePattern(KAFKA_TOPICS.PUBLISH_ISSUES)
  async handlePublishedIssues(
    @Payload() payload: kafkaPayloadInterface.KafkaIssuePayload,
    @Ctx() kafkacontext: KafkaContext,
  ) {
    try {
      await this.issuesService.createFromKafkaPayload(payload);
      await this.commitOffset(kafkacontext);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error processing issue with id ${payload?.issue?.id}: ${err.message}`,
        err.stack,
        IssuesController.name,
      );
    }
  }

  @Get('repos')
  async getRepos(
    @Query('search', new DefaultValuePipe('')) search: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<{ data: { repo: string; count: number }[]; total: number }> {
    return this.issuesService.getRepos(search, page, limit);
  }

  private async commitOffset(context: KafkaContext): Promise<void> {
    const topic = context.getTopic();
    const partition = context.getPartition();
    const { offset } = context.getMessage();
    await context
      .getConsumer()
      .commitOffsets([
        { topic, partition, offset: (parseInt(offset) + 1).toString() },
      ]);
  }

  // issues.controller.ts — add this
  @Get('qa-dashboard-stats')
  async getQADashboardStats(@Request() req: AuthenticatedRequest) {
    const token = extractToken(req);
    return await this.issuesService.getQADashboardStats(token as string);
  }

  @Get('search')
  async semanticSearch(
    @Request() req: AuthenticatedRequest,
    @Query() dto: SearchIssuesDto,
  ): Promise<SemanticSearchResult> {
    const userId = extractUserId(req) as string;
    return this.issuesService.semanticSearch(userId, dto);
  }

  @Get('duplicates')
  async getDuplicateIssues(
    @Request() req: AuthenticatedRequest,
  ): Promise<{ duplicateGroups: DuplicateGroup[] }> {
    const token = extractToken(req) as string;
    return await this.issuesService.getDuplicateIssues(token);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /issues/clusters
  // Returns all properly-clustered issue groups for the authenticated user.
  // ─────────────────────────────────────────────────────────────────────────────
  @Get('clusters')
  async getClusters(
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(6), ParseIntPipe) limit: number,
    @Query('search', new DefaultValuePipe('')) search: string,
  ): Promise<{ clusters: ClusterSummary[]; total: number }> {
    const token = extractToken(req) as string;
    return this.issuesService.getClusters(token, page, limit, search);
  }

  @Get('clusters/:cluster_id/repos')
  async getClusterRepos(
    @Request() req: AuthenticatedRequest,
    @Param('cluster_id', ParseIntPipe) clusterId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(8), ParseIntPipe) limit: number,
  ): Promise<{ data: ClusterRepoItem[]; total: number }> {
    const token = extractToken(req) as string;
    return this.issuesService.getClusterRepos(token, clusterId, page, limit);
  }

  @Get('clusters/:cluster_id/issues')
  async getClusterRepoIssues(
    @Request() req: AuthenticatedRequest,
    @Param('cluster_id', ParseIntPipe) clusterId: number,
    @Query('repo') repo: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(15), ParseIntPipe) limit: number,
  ): Promise<{ data: ClusterIssue[]; total: number }> {
    const token = extractToken(req) as string;
    return this.issuesService.getClusterRepoIssues(
      token,
      clusterId,
      repo,
      page,
      limit,
    );
  }
  // ─────────────────────────────────────────────────────────────────────────────
  // POST /issues/clusters/:cluster_id/summarize
  // Triggers Gemini (via FastAPI) to generate a root-cause summary for a cluster.
  // ─────────────────────────────────────────────────────────────────────────────
  @Post('clusters/:cluster_id/summarize')
  async summarizeCluster(
    @Request() req: AuthenticatedRequest,
    @Param('cluster_id', ParseIntPipe) clusterId: number,
  ): Promise<{ summary: string }> {
    const token = extractToken(req) as string;
    return this.issuesService.summarizeCluster(token, clusterId);
  }

  /**
   * GET /issues/dashboard-stats
   *
   * Returns all metrics needed for the Software Engineer dashboard in a
   * single round-trip. Scoped to the authenticated user via JWT.
   *
   * Response shape: IssueDashboardStats
   *   total, open, closed
   *   clustered, noise, poorlyDescribed
   *   clusterDistribution[]  — open+closed counts per cluster label
   *   recentIssues[]         — last 20 issues with quality flags
   */
  @Get('dashboard-stats')
  async getDashboardStats(@Request() req: AuthenticatedRequest) {
    const token = extractToken(req) as string;
    return this.issuesService.getDashboardStats(token);
  }

  @Get()
  async getIssues(
    @Request() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search', new DefaultValuePipe('')) search: string,
    @Query('state', new DefaultValuePipe('all'))
    state: 'open' | 'closed' | 'all',
    @Query('repos', new DefaultValuePipe('')) reposParam: string,
  ): Promise<{ data: Issue[]; total: number }> {
    const userId = extractUserId(req);
    const repos = reposParam
      ? reposParam.split(',').filter(Boolean)
      : undefined;
    return this.issuesService.findAll(
      page,
      limit,
      userId,
      search,
      state,
      repos,
    );
  }

  /**
   * POST /issues/cluster
   * Trigger a clustering job for all issues that have embeddings.
   * Returns job_id immediately.
   */
  @Post('cluster')
  async triggerClustering(): Promise<{
    job_id: string;
    total_issues: number;
    total_chunks: number;
  }> {
    return this.issuesService.triggerClustering();
  }

  /**
   * POST /issues/cluster-results
   * Called by FastAPI after clustering completes.
   * Bulk-writes cluster_id + cluster_label back to MongoDB.
   */
  @Post('cluster-results')
  async saveClusterResults(
    @Body() results: ClusterResultDto[],
  ): Promise<{ updated: number }> {
    return this.issuesService.saveClusterResults(results);
  }

  @Post('chat')
  async chatWithIssues(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ChatIssuesDto,
  ): Promise<ChatIssuesResult> {
    const userId = extractUserId(req) as string;
    return this.issuesService.chatWithIssues(userId, dto);
  }
}
