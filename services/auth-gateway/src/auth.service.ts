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

@Injectable()
export class AuthService implements OnModuleInit {

  private changePasswordSecret;

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

  async  getNewAccessToken(refresh_token: string) {
   return await this.keyclockClient.getNewAccessToken(refresh_token);
  }

  async signup(createUserDto: CreateUserDto) {
    let userIdInKeyclock: string | null = null;
    try {
      // keyclock part: save user data in keyclock for future authN/authnZ (identity provider responsability)
      userIdInKeyclock =
        await this.keyclockClient.createUserInKeyclock(createUserDto);

      // getRoleId : i think i should save it in an env variable instead of doing a http request each time
      const roleData = await this.keyclockClient.getRoleByName(
        createUserDto.role,
      );

      // assing role to the user
      await this.keyclockClient.assignRoleToUser(userIdInKeyclock, roleData);

      await this.userServiceClient.saveUser(createUserDto, userIdInKeyclock);

      return { message: 'done', userId: userIdInKeyclock };
    } catch (error: any) {
      // Saga / Compensating transaction: roll back Keycloak user if it was created
      if (userIdInKeyclock) {
        try {
          await this.keyclockClient.deleteUserInKeyclock(userIdInKeyclock);
          this.logger.warn(`Rolled back Keycloak user: ${userIdInKeyclock}`);
        } catch (rollbackError: any) {
          // Rollback failed — this is now a ghost user in Keycloak, needs human attention
          this.logger.error(
            `CRITICAL: Failed to rollback Keycloak user ${userIdInKeyclock}: ${JSON.stringify(normalizeAxiosError(rollbackError))}`,
          );
        }
      }
        this.logger.error(error);
    throw new ConflictException(normalizeAxiosError(error));
    }
  }

  async forgetPassowrd(email: any) {
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
    } catch (error: any) {
      throw new InternalServerErrorException(error.message);
    }
  }

  async generateResetToken(payload) {
    try {
      return await this.jwtService.signAsync(payload);
    } catch (error) {
      this.logger.error(error);
    }
  }

  async verifyResetPasswordToken(resetToken: any) {
    // if it is valid redirect user to new page to choose a new password
    // else not authorized page is shown
    let verifiedToken;
    try {
      verifiedToken = await this.jwtService.verifyAsync(resetToken);
    } catch (error: any) {
      this.logger.error(normalizeAxiosError(error));
      throw new UnauthorizedException(error.message);
    }

    const user = await this.userServiceClient.getUserByEmail(
      verifiedToken.email,
    );
    if (user.resetPasswordToken !== resetToken)
      throw new UnauthorizedException('reset token is incorrect');

    // reset token should be used one time only
    await this.userServiceClient.updateResetPasswordProperty(
      verifiedToken.email,
      '',
    );

    return this.generateChangePasswordToken(user.id);
  }

  async changePassword(
    newPassword,
    oldPassowrd?: any,
    access_token?: any,
    resetToken?: any,
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
    } catch (error: any) {
      throw new InternalServerErrorException(error.message);
    }
    throw new BadRequestException('bad request');
  }

  async generateChangePasswordToken(userId) {
    const payload = {
      userId,
    };
    const tmpJWTToUpdatePassword = await this.jwtService.signAsync(payload, {
      secret: this.changePasswordSecret,
      expiresIn: JWT_Change_PASSWORD_EXPIRY,
    });

    return tmpJWTToUpdatePassword;
  }

  async getUserId(resetToken) {
    const payload = await this.verifyToken(resetToken);
    return payload.userId;
  }

  async verifyToken(resetToken) {
    const payload = await this.jwtService.verifyAsync(resetToken, {
      secret: this.changePasswordSecret,
    });
    return payload;
  }

  extractUserDataFromAccesstoken(access_token) {
    const { sub, email } = this.jwtService.decode(access_token);
    return { userId: sub, email };
  }
}
