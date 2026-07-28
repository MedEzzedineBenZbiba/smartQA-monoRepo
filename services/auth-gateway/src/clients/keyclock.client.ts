import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { firstValueFrom } from 'rxjs';
import { normalizeAxiosError } from 'src/common/utils/axios-error.util';
import { CreateUserDto } from 'src/dto/create-user.dto';
import url from 'url';

@Injectable()
// It's a client more than a service
export class KeyclockClient implements OnModuleInit {


  private keyclockBaseUrl;
  private adminUsername;
  private adminPassword;
  // Fetch once, reuse until expiry
  private adminToken;
  private adminTokenExpiry;

  constructor(
    private readonly httpService: HttpService,
    private readonly logger: Logger,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    this.keyclockBaseUrl =
      this.configService.getOrThrow<string>('KeyclockBaseUrl');
    this.adminUsername = this.configService.getOrThrow<string>(
      'KEYCLOAK_ADMIN_USERNAME',
    );
    this.adminPassword = this.configService.getOrThrow<string>(
      'KEYCLOAK_ADMIN_PASSWORD',
    );
  }

  async getNewAccessToken(refresh_token: string) {
    const newTokenUrl = `${this.keyclockBaseUrl}/realms/smart_qa_assistant/protocol/openid-connect/token`;
        const params = new url.URLSearchParams({
      grant_type: 'refresh_token',
      client_id: 'auth-gateway',
      refresh_token: refresh_token
    });

    try {
      const { data } = await firstValueFrom(
        this.httpService.post(newTokenUrl, params.toString()),
      );
      return data;
    } catch (error:any) {
       this.logger.error(normalizeAxiosError(error));
      throw new UnauthorizedException(normalizeAxiosError(error));
    }
  }

  

  async assignRoleToUser(userIdInKeyclock, roleData) {
    const admin_access_token = await this.getAdminToken();
    const assingRoleToUserUrl = this.getAssignRoleToUserUrl(userIdInKeyclock);

    const roleRepresentation = [
      {
        id: roleData.id,
        name: roleData.name,
      },
    ];

    const config = this.buildAuthHeaders(admin_access_token);

    const { data } = await firstValueFrom(
      this.httpService.post(assingRoleToUserUrl, roleRepresentation, config),
    );
    return data;
  }



  async createUserInKeyclock(createUserDto: CreateUserDto) {
    const admin_access_token = await this.getAdminToken();
    const createUserInkKeyclockUrl = this.getUsersAPI_Url();

    const userRepresentation = {
      username: createUserDto.email,
      email: createUserDto.email,
      enabled: true,
      credentials: [
        {
          type: 'password',
          value: createUserDto.password,
          temporary: false,
        },
      ],
    };

    const config = this.buildAuthHeaders(admin_access_token);

    const { headers } = await firstValueFrom(
      this.httpService.post(
        createUserInkKeyclockUrl,
        userRepresentation,
        config,
      ),
    );
    const userIdInKeyclock = headers.location.split('/').at(-1);
    return userIdInKeyclock;
  }

  getUsersAPI_Url() {
    return `${this.keyclockBaseUrl}/admin/realms/smart_qa_assistant/users`;
  }

  async login(username: string, password: string) {
    const keyclockLoginUrl = this.getKeyclockUserLoginUrl();
    const params = new url.URLSearchParams({
      grant_type: 'password',
      client_id: 'auth-gateway',
      username: username,
      password: password,
    });

    try {
      const { data } = await firstValueFrom(
        this.httpService.post(keyclockLoginUrl, params.toString()),
      );
      return data;
    } catch (error:any) {
       this.logger.error(normalizeAxiosError(error));
      throw new UnauthorizedException(normalizeAxiosError(error));
    }
  }

  private getKeyclockUserLoginUrl() {
    return `${this.keyclockBaseUrl}/realms/smart_qa_assistant/protocol/openid-connect/token`;
  }

  async getRoleByName(roleName) {
    const admin_access_token = await this.getAdminToken();
    const getRealmUrl = this.getRoleByNameUrl(roleName);

    const config = this.buildAuthHeaders(admin_access_token);

    const { data } = await firstValueFrom(
      this.httpService.get(getRealmUrl, config),
    );
    return data;
  }

  getRoleByNameUrl(roleName: any) {
    return `${this.keyclockBaseUrl}/admin/realms/smart_qa_assistant/roles/${roleName}`;
  }

  private async getAdminToken() {
    if (this.adminToken && Date.now() < this.adminTokenExpiry) {
      return this.adminToken;
    }
    const adminLoginUrl = this.getAdminLoginUrl();
    const params = new url.URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: this.adminUsername,
      password: this.adminPassword,
    });

    try {
      const { data } = await firstValueFrom(
        this.httpService.post(adminLoginUrl, params.toString()),
      );
      this.adminToken = data.access_token;
      this.adminTokenExpiry = Date.now() + (data.expires_in - 30) * 1000; // 30s buffer
      return this.adminToken;
    } catch (error:any) {
      throw new InternalServerErrorException(normalizeAxiosError(error.message))
    }
  }

  private getAdminLoginUrl() {
    return `${this.keyclockBaseUrl}/realms/master/protocol/openid-connect/token`;
  }

  async changePassword(userId, newPassword) {
    const admin_access_token = await this.getAdminToken();

    const keyclockResetPasswordUrl = this.getKeyclockResetPasswordUrl(userId);

    const credentialRepresentation = {
      type: 'password',
      temporary: false,
      value: newPassword,
    };

    const config = this.buildAuthHeaders(admin_access_token);

    try {
      const { data } = await firstValueFrom(
        this.httpService.put(
          keyclockResetPasswordUrl,
          credentialRepresentation,
          config,
        ),
      );
      return data;
    } catch (error:any) {
      throw new InternalServerErrorException(normalizeAxiosError(error));
    }
  }

  private getKeyclockResetPasswordUrl(userId: any) {
    return `${this.keyclockBaseUrl}/admin/realms/smart_qa_assistant/users/${userId}/reset-password`;
  }

  private buildAuthHeaders(token: string) {
    return {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };
  }

  private getAssignRoleToUserUrl(userIdInKeyclock) {
    return `${this.keyclockBaseUrl}/admin/realms/smart_qa_assistant/users/${userIdInKeyclock}/role-mappings/realm`;
  }


    async deleteUserInKeyclock(userId: string) {
    const admin_access_token = await this.getAdminToken();
    const deleteUsersEndpoint = this.getDeleteUserUrl(userId);

    const config = this.buildAuthHeaders(admin_access_token);

    const { headers } = await firstValueFrom(
      this.httpService.delete(
        deleteUsersEndpoint,
        config,
      ),
    );
    const userIdInKeyclock = headers.location.split('/').at(-1);
    return userIdInKeyclock;
  }
  getDeleteUserUrl(userId:string) {
    return this.getUsersAPI_Url() +"/"+userId;
  }

  


 
  }
