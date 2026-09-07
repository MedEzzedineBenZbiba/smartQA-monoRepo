import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { ConsulClient } from './consul.client';
import { CreateUserDto } from 'src/dto/create-user.dto';
import { normalizeAxiosError } from 'src/common/utils/axios-error.util';

interface UserRecord {
  id: string;
  email: string;
  username: string;
  resetPasswordToken: string;
}

@Injectable()
// It's a client more than a service
export class UserServiceClient implements OnModuleInit {
  private userServiceName!: string;
  constructor(
    private readonly httpService: HttpService,
    private readonly logger: Logger,
    private readonly configService: ConfigService,
    private readonly consulClient: ConsulClient,
  ) {}
  onModuleInit() {
    this.userServiceName = this.configService.getOrThrow('USER_SERVICE_NAME');
  }

  async saveUser(createUserDto: CreateUserDto, userIdInKeyclock: string) {
    const createUserUrl = await this.getCreateUserUrl();

    const userDataWithIdForUserMicroservice = {
      ...createUserDto,
      id: userIdInKeyclock,
    };
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<UserRecord>(
          createUserUrl,
          userDataWithIdForUserMicroservice,
        ),
      );
      return data;
    } catch (error: unknown) {
      this.logger.error(normalizeAxiosError(error));
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  async updateResetPasswordProperty(email: string, resetPasswordToken: string) {
    const updateResetTokenPropertyUrl =
      await this.getUpdateResetTokenPropertyUrl();
    try {
      await firstValueFrom(
        this.httpService.patch(updateResetTokenPropertyUrl, {
          email,
          resetPasswordToken,
        }),
      );
    } catch (error: unknown) {
      this.logger.error(normalizeAxiosError(error));
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  async getUserByEmail(email: string): Promise<UserRecord> {
    const getUserByEmailUrl = await this.getUserByEmailUrl(email);
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<UserRecord>(getUserByEmailUrl).pipe(),
      );
      return data;
    } catch (error: unknown) {
      this.logger.error(JSON.stringify(normalizeAxiosError(error)));
      throw new NotFoundException(
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  private async getBaseUrl(): Promise<string> {
    return await this.consulClient.discoverService(this.userServiceName);
  }

  private async getCreateUserUrl(): Promise<string> {
    return `${await this.getBaseUrl()}/users/create`;
  }

  private async getUpdateResetTokenPropertyUrl(): Promise<string> {
    return `${await this.getBaseUrl()}/users/update-reset-token`;
  }

  private async getUserByEmailUrl(email: string): Promise<string> {
    return `${await this.getBaseUrl()}/users/email/${email}`;
  }
}
