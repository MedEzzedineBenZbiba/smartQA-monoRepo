import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Query,
  Delete,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateResetTokenDto } from './dto/update-reset-token.dto';
import { PaginationDto } from './dto/pagination.dto';
import { User } from './entities/user.entity';
import { GithubTokenService } from './github-token.service';
import { SyncJobService } from './sync-job.service';
import { CreateSyncJobDto, UpdateSyncJobDto } from './dto/create-sync-job.dto';
import { SaveGithubTokenDto } from './dto/github-token.dto';

@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly githubTokenService: GithubTokenService, // add this
    private readonly syncJobService: SyncJobService, // add this
  ) {}

  /*   We can now delete the user/create endpoint from the UserController, since it 
doesn’t treat passwords as we expected. */
  @Post('create')
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  @Get('stats/gender')
  getGenderStats() {
    return this.userService.getGenderStats();
  }

  @Get('stats/dashboard')
  getDashboardStats() {
    return this.userService.getDashboardStats();
  }

  @Get('check')
  healthCheck() {
    return { status: 'ok' };
  }

  @Get('email/:email')
  findOneByEmail(@Param('email') email: string) {
    return this.userService.getUserByEmail(email);
  }

  @Get('username/:username')
  findOneByUsername(@Param('username') username: string) {
    return this.userService.getUserByUsername(username);
  }

  @Get()
  async findAll(
    @Query() paginationDto: PaginationDto,
    @Query('search') search = '',
    @Query('roles') roles?: string | string[],
  ): Promise<{ data: User[]; total: number; totalPages: number }> {
    // normalize: "Tech Lead" → ["Tech Lead"], ["a","b"] → ["a","b"]
    const rolesArray = roles ? (Array.isArray(roles) ? roles : [roles]) : [];

    return await this.userService.findAll(
      paginationDto.page,
      paginationDto.limit,
      search,
      rolesArray,
    );
  }

  @Patch('update-reset-token')
  updateResetPasswordToken(@Body() updateResetTokenDto: UpdateResetTokenDto) {
    return this.userService.updateResetPasswordToken(
      updateResetTokenDto.email,
      updateResetTokenDto.resetPasswordToken,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.getUserById(id);
  }

  @Patch('last-ingestion-date')
  updateLastIngestionDate(@Body() body: UpdateLastIngestionDateBody) {
    return this.userService.updateLastIngestionDate(
      body.lastIngestionDate,
      body.userId,
    );
  }

  @Get('stats/recent-hires')
  getRecentHires() {
    return this.userService.getRecentHires();
  }

  @Get('last-ingestion-date/:id')
  getLastIngestionDate(@Param('id') userId: string) {
    return this.userService.getLastIngestionDate(userId);
  }

  @Post('github-tokens')
  saveGithubToken(@Body() dto: SaveGithubTokenDto) {
    return this.githubTokenService.saveToken(dto);
  }

  @Get('github-tokens/:userId')
  getGithubToken(@Param('userId') userId: string) {
    return this.githubTokenService.getToken(userId);
  }

  @Get('github-tokens/:userId/exists')
  hasGithubToken(@Param('userId') userId: string) {
    return this.githubTokenService.hasToken(userId);
  }

  @Delete('github-tokens/:userId')
  deleteGithubToken(@Param('userId') userId: string) {
    return this.githubTokenService.deleteToken(userId);
  }

  // ── Sync job endpoints ──────────────────────────────────────────────────────

  @Post('sync-jobs')
  createSyncJob(@Body() dto: CreateSyncJobDto) {
    return this.syncJobService.createSyncJob(dto);
  }

  @Get('sync-jobs/user/:userId')
  getSyncJobsByUser(@Param('userId') userId: string) {
    return this.syncJobService.getSyncJobsByUser(userId);
  }

  @Get('sync-jobs/due')
  getDueSyncJobs() {
    return this.syncJobService.getDueSyncJobs();
  }

  @Patch('sync-jobs/:id')
  updateSyncJob(@Param('id') id: string, @Body() dto: UpdateSyncJobDto) {
    return this.syncJobService.updateSyncJob(id, dto);
  }

  @Post('sync-jobs/:id/pause')
  pauseSyncJob(@Param('id') id: string) {
    return this.syncJobService.pauseSyncJob(id);
  }

  @Post('sync-jobs/:id/resume')
  resumeSyncJob(@Param('id') id: string) {
    return this.syncJobService.resumeSyncJob(id);
  }

  @Delete('sync-jobs/:id')
  deleteSyncJob(@Param('id') id: string) {
    return this.syncJobService.deleteSyncJob(id);
  }
}

interface UpdateLastIngestionDateBody {
  lastIngestionDate: Date;
  userId: string;
}
