import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GithubToken } from './entities/github-token.entity';
import { SaveGithubTokenDto } from './dto/github-token.dto';
import { normalizeError } from './common/utils/normalizedError.util';

@Injectable()
export class GithubTokenService {
  constructor(
    @InjectRepository(GithubToken)
    private readonly githubTokenRepository: Repository<GithubToken>,
    private readonly logger: Logger,
  ) {}

  async saveToken(dto: SaveGithubTokenDto): Promise<GithubToken | null> {
    try {
      // Upsert — one token per user, replace if exists
      const existing = await this.githubTokenRepository.findOne({
        where: { userId: dto.userId },
      });

      if (existing) {
        await this.githubTokenRepository.update(
          { userId: dto.userId },
          {
            accessToken: dto.accessToken,
            accessTokenExpiry: dto.accessTokenExpiry,
            refreshToken: dto.refreshToken,
            refreshTokenExpiry: dto.refreshTokenExpiry,
          },
        );
        return this.githubTokenRepository.findOne({
          where: { userId: dto.userId },
        });
      }

      const token = this.githubTokenRepository.create(dto);
      return await this.githubTokenRepository.save(token);
    } catch (error: unknown) {
      const normalized = normalizeError(error);
      this.logger.error(normalized);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(normalized.message);
    }
  }

  async getToken(userId: string): Promise<GithubToken | null> {
    try {
      return await this.githubTokenRepository.findOne({
        where: { userId },
      });
    } catch (error: unknown) {
      const normalized = normalizeError(error);
      this.logger.error(normalized);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(normalized.message);
    }
  }

  async deleteToken(userId: string): Promise<void> {
    try {
      const result = await this.githubTokenRepository.delete({ userId });
      if (result.affected === 0) {
        throw new NotFoundException(`No GitHub token found for user ${userId}`);
      }
    } catch (error: unknown) {
      const normalized = normalizeError(error);
      this.logger.error(normalized);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(normalized.message);
    }
  }

  async hasToken(userId: string): Promise<boolean> {
    try {
      const count = await this.githubTokenRepository.count({
        where: { userId },
      });
      return count > 0;
    } catch (error: unknown) {
      const normalized = normalizeError(error);
      this.logger.error(normalized);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(normalized.message);
    }
  }
}
