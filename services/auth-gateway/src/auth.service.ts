import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { KeyclockClient } from './clients/keyclock.client';
import { CreateUserDto } from './dto/create-user.dto';
import { UserServiceClient } from './clients/user-service.client';
import { normalizeAxiosError } from './common/utils/axios-error.util';
import { KafkaProducerClient } from './clients/kafka-producer.client';
import { JWT_Change_PASSWORD_EXPIRY } from './constants/auth.constants';

interface ResetTokenPayload {
  email: string;
}

interface ChangePasswordTokenPayload {
  userId: string;
}

interface AccessTokenPayload {
  sub: string;
  email: string;
}

interface UserRecord {
  id: string;
  email: string;
  resetPasswordToken: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private changePasswordSecret!: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly logger: Logger,
    private readonly configService: ConfigService,
    private readonly keyclockClient: KeyclockClient,
    private readonly userServiceClient: UserServiceClient,
    private readonly kafkaProducerClient: KafkaProducerClient,
  ) {}

  onModuleInit() {
    this.changePasswordSecret = this.configService.getOrThrow<string>(
      'JWT_Change_Password_Secret',
    );
  }

  async login(username: string, password: string) {
    return await this.keyclockClient.login(username, password);
  }

  async getNewAccessToken(refresh_token: string) {
    return await this.keyclockClient.getNewAccessToken(refresh_token);
  }

  async signup(createUserDto: CreateUserDto) {
    let userIdInKeyclock: string | null = null;
    try {
      userIdInKeyclock =
        await this.keyclockClient.createUserInKeyclock(createUserDto);

      const roleData = await this.keyclockClient.getRoleByName(
        createUserDto.role,
      );

      await this.keyclockClient.assignRoleToUser(userIdInKeyclock, roleData);

      await this.userServiceClient.saveUser(createUserDto, userIdInKeyclock);

      return { message: 'done', userId: userIdInKeyclock };
    } catch (error: unknown) {
      if (userIdInKeyclock) {
        try {
          await this.keyclockClient.deleteUserInKeyclock(userIdInKeyclock);
          this.logger.warn(`Rolled back Keycloak user: ${userIdInKeyclock}`);
        } catch (rollbackError: unknown) {
          this.logger.error(
            `CRITICAL: Failed to rollback Keycloak user ${userIdInKeyclock}: ${JSON.stringify(
              normalizeAxiosError(rollbackError),
            )}`,
          );
        }
      }
      this.logger.error(error);
      throw new ConflictException(normalizeAxiosError(error));
    }
  }

  async forgetPassowrd(email: string) {
    try {
      const resetPasswordToken = await this.generateResetToken({ email });
      await this.userServiceClient.updateResetPasswordProperty(
        email,
        resetPasswordToken,
      );
      await this.kafkaProducerClient.publishNotification({
        email,
        resetPasswordToken,
      });
    } catch (error: unknown) {
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  async generateResetToken(payload: ResetTokenPayload): Promise<string> {
    try {
      return await this.jwtService.signAsync(payload);
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async verifyResetPasswordToken(resetToken: string) {
    let verifiedToken: ResetTokenPayload;
    try {
      verifiedToken =
        await this.jwtService.verifyAsync<ResetTokenPayload>(resetToken);
    } catch (error: unknown) {
      this.logger.error(normalizeAxiosError(error));
      throw new UnauthorizedException(
        error instanceof Error ? error.message : 'Unknown error',
      );
    }

    const user: UserRecord = await this.userServiceClient.getUserByEmail(
      verifiedToken.email,
    );
    if (user.resetPasswordToken !== resetToken)
      throw new UnauthorizedException('reset token is incorrect');

    await this.userServiceClient.updateResetPasswordProperty(
      verifiedToken.email,
      '',
    );

    return this.generateChangePasswordToken(user.id);
  }

  async changePassword(
    newPassword: string,
    oldPassowrd?: string | null,
    access_token?: string | null,
    resetToken?: string | null,
  ) {
    try {
      if (resetToken) {
        const userId = await this.getUserId(resetToken);
        await this.keyclockClient.changePassword(userId, newPassword);
        return { message: 'updated' };
      } else if (oldPassowrd && access_token) {
        const { email, userId } =
          this.extractUserDataFromAccesstoken(access_token);
        const data = await this.login(email, oldPassowrd);
        if (data) {
          await this.keyclockClient.changePassword(userId, newPassword);
          return { message: 'updated' };
        }
      }
    } catch (error: unknown) {
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
    throw new BadRequestException('bad request');
  }

  async generateChangePasswordToken(userId: string): Promise<string> {
    const payload: ChangePasswordTokenPayload = { userId };
    return await this.jwtService.signAsync(payload, {
      secret: this.changePasswordSecret,
      expiresIn: JWT_Change_PASSWORD_EXPIRY,
    });
  }

  async getUserId(resetToken: string): Promise<string> {
    const payload = await this.verifyToken(resetToken);
    return payload.userId;
  }

  async verifyToken(resetToken: string): Promise<ChangePasswordTokenPayload> {
    return await this.jwtService.verifyAsync<ChangePasswordTokenPayload>(
      resetToken,
      { secret: this.changePasswordSecret },
    );
  }

  extractUserDataFromAccesstoken(access_token: string): {
    userId: string;
    email: string;
  } {
    const { sub, email } =
      this.jwtService.decode<AccessTokenPayload>(access_token);
    return { userId: sub, email };
  }
}
