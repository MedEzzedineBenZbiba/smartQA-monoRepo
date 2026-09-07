import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Not, Repository, UpdateResult } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { normalizeError } from './common/utils/normalizedError.util';
import { UserRole } from './entities/userRole.enum';

interface GenderCountRow {
  gender: string | null;
  count: string;
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly logger: Logger,
    private readonly configService: ConfigService,
  ) {}

  async getDashboardStats(): Promise<{
    total: number;
    byRole: Record<string, number>;
    byGender: { male: number; female: number };
  }> {
    try {
      const [total, roleRaw, genderStats] = await Promise.all([
        this.userRepository.count({
          where: { role: Not(UserRole.Superadmin) },
        }),

        this.userRepository
          .createQueryBuilder('user')
          .select('user.role', 'role')
          .addSelect('COUNT(*)', 'count')
          .where('user.role != :role', { role: UserRole.Superadmin })
          .groupBy('user.role')
          .getRawMany<{ role: string; count: string }>(),

        this.getGenderStats(),
      ]);

      const byRole: Record<string, number> = {};
      for (const row of roleRaw) {
        byRole[row.role] = parseInt(row.count, 10);
      }

      return { total, byRole, byGender: genderStats };
    } catch (error: unknown) {
      const normalized = normalizeError(error);
      this.logger.error(normalized);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(normalized.message);
    }
  }

  async getGenderStats(): Promise<{ male: number; female: number }> {
    try {
      const result = await this.userRepository
        .createQueryBuilder('user')
        .select('user.gender', 'gender')
        .addSelect('COUNT(*)', 'count')
        .where('user.role != :role', { role: 'superadmin' })
        .groupBy('user.gender')
        .getRawMany<GenderCountRow>();

      const stats = { male: 0, female: 0 };

      for (const row of result) {
        if (row.gender === 'male') {
          stats.male = parseInt(row.count, 10);
        }

        if (row.gender === 'female') {
          stats.female = parseInt(row.count, 10);
        }
      }

      return stats;
    } catch (error: unknown) {
      const normalized = normalizeError(error);
      this.logger.error(normalized);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(normalized.message);
    }
  }

  async create(user: CreateUserDto): Promise<User> {
    try {
      const newUser = this.userRepository.create(user);
      return await this.userRepository.save(newUser);
    } catch (error: unknown) {
      const normalized = normalizeError(error);
      this.logger.error(normalized);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(normalized.message);
    }
  }

  async getRecentHires(): Promise<User[]> {
    try {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      return await this.userRepository
        .createQueryBuilder('user')
        .where('user.createdAt >= :threeMonthsAgo', { threeMonthsAgo })
        .andWhere('user.role != :role', { role: 'superadmin' })
        .orderBy('user.createdAt', 'DESC')
        .getMany();
    } catch (error: unknown) {
      const normalized = normalizeError(error);
      this.logger.error(normalized);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(normalized.message);
    }
  }

  async getUserByEmail(email: string): Promise<User> {
    let user: User | null;
    try {
      user = await this.userRepository.findOne({
        where: { email },
      });
    } catch (error: unknown) {
      const normalized = normalizeError(error);
      this.logger.error(normalized);
      throw new InternalServerErrorException(normalized.message);
    }
    if (user) {
      this.logger.log(`User found: ${user.id}`);
      return user;
    }
    throw new NotFoundException('user does not exist');
  }

  async getUserById(id: string): Promise<User> {
    let user: User | null;
    try {
      user = await this.userRepository.findOne({
        where: { id },
      });
    } catch (error: unknown) {
      const normalized = normalizeError(error);
      this.logger.error(normalized);
      throw new InternalServerErrorException(normalized.message);
    }
    if (user) return user;
    throw new NotFoundException('user does not exist');
  }

  async getUserByUsername(username: string): Promise<User> {
    let user: User | null;
    try {
      user = await this.userRepository.findOne({
        where: { username },
      });
    } catch (error: unknown) {
      const normalized = normalizeError(error);
      this.logger.error(normalized);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(normalized.message);
    }
    if (user) return user;
    throw new NotFoundException('user does not exist');
  }

  async findAll(
    page = 1,
    limit = 20,
    search = '',
    roles: string[] = [],
  ): Promise<{ data: User[]; total: number; totalPages: number }> {
    try {
      const roleCondition = roles.length > 0 ? In(roles) : undefined;

      const [data, total] = await this.userRepository.findAndCount({
        where: search
          ? [
              {
                username: ILike(`%${search}%`),
                ...(roleCondition && { role: roleCondition }),
              },
              {
                email: ILike(`%${search}%`),
                ...(roleCondition && { role: roleCondition }),
              },
            ]
          : roleCondition
            ? { role: roleCondition }
            : {},
        take: limit,
        skip: (page - 1) * limit,
      });

      return {
        data,
        total,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error: unknown) {
      const normalized = normalizeError(error);
      this.logger.error(normalized);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(normalized.message);
    }
  }

  async updateLastIngestionDate(
    lastIngestionDate: Date,
    userId: string,
  ): Promise<void> {
    let result: UpdateResult;
    try {
      result = await this.userRepository.update(
        { id: userId },
        { lastIngestionDate },
      );
    } catch (error: unknown) {
      const normalized = normalizeError(error);
      this.logger.error(normalized);
      throw new InternalServerErrorException(normalized.message);
    }
    if (result.affected === 0) {
      throw new NotFoundException('user doesn t exist');
    }
  }

  async getLastIngestionDate(userId: string): Promise<Date | null> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        select: { id: true, lastIngestionDate: true },
      });

      if (!user) {
        throw new NotFoundException(`User with id ${userId} not found`);
      }

      return user.lastIngestionDate;
    } catch (error: unknown) {
      const normalized = normalizeError(error);
      this.logger.error(normalized);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(normalized.message);
    }
  }

  async updateResetPasswordToken(
    email: string,
    resetPasswordToken: string,
  ): Promise<void> {
    let result: UpdateResult;
    try {
      if (resetPasswordToken) {
        await this.jwtService.verifyAsync(resetPasswordToken, {
          secret: this.configService.getOrThrow<string>(
            'JWT_RESET_PASSWORD_SECRET',
          ),
        });
        result = await this.userRepository.update(
          { email },
          { resetPasswordToken },
        );
      } else {
        result = await this.userRepository.update(
          { email },
          { resetPasswordToken: '' },
        );
      }
    } catch (error: unknown) {
      const normalized = normalizeError(error);
      this.logger.error(normalized);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(normalized.message);
    }
    if (result.affected === 0) {
      throw new NotFoundException('user doesn t exist');
    }
  }
}
