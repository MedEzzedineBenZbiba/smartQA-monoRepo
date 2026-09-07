import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { KeyclockClient } from './clients/keyclock.client';
import { UserServiceClient } from './clients/user-service.client';
import { KafkaProducerClient } from './clients/kafka-producer.client';
import { JWT_Change_PASSWORD_EXPIRY } from './constants/auth.constants';

describe('AuthService', () => {
  let authService: AuthService;

  const mockJwtService = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
    decode: jest.fn(),
  };

  const mockLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  const mockConfigService = {
    getOrThrow: jest.fn(),
  };

  const mockKeyclockClient = {
    login: jest.fn(),
    getNewAccessToken: jest.fn(),
    createUserInKeyclock: jest.fn(),
    getRoleByName: jest.fn(),
    assignRoleToUser: jest.fn(),
    deleteUserInKeyclock: jest.fn(),
    changePassword: jest.fn(),
  };

  const mockUserServiceClient = {
    saveUser: jest.fn(),
    updateResetPasswordProperty: jest.fn(),
    getUserByEmail: jest.fn(),
  };

  const mockKafkaProducerClient = {
    publishNotification: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: Logger, useValue: mockLogger },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: KeyclockClient, useValue: mockKeyclockClient },
        { provide: UserServiceClient, useValue: mockUserServiceClient },
        { provide: KafkaProducerClient, useValue: mockKafkaProducerClient },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);

    mockConfigService.getOrThrow.mockReturnValue('change-password-secret');
    authService.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(authService).toBeDefined();
  });

  // ---------------------------------------------------------------------
  // signup — success + rollback behavior
  // ---------------------------------------------------------------------
  describe('signup', () => {
    const createUserDto = {
      username: 'john',
      email: 'john@example.com',
      password: 'pass123',
      role: 'user',
    };

    it('should create user in keycloak, assign role, save user, and return success', async () => {
      mockKeyclockClient.createUserInKeyclock.mockResolvedValue('kc-user-1');
      mockKeyclockClient.getRoleByName.mockResolvedValue({ id: 'role-1' });
      mockKeyclockClient.assignRoleToUser.mockResolvedValue(undefined);
      mockUserServiceClient.saveUser.mockResolvedValue(undefined);

      const result = await authService.signup(createUserDto as any);

      expect(mockKeyclockClient.createUserInKeyclock).toHaveBeenCalledWith(
        createUserDto,
      );
      expect(mockKeyclockClient.getRoleByName).toHaveBeenCalledWith(
        createUserDto.role,
      );
      expect(mockKeyclockClient.assignRoleToUser).toHaveBeenCalledWith(
        'kc-user-1',
        { id: 'role-1' },
      );
      expect(mockUserServiceClient.saveUser).toHaveBeenCalledWith(
        createUserDto,
        'kc-user-1',
      );
      expect(mockKeyclockClient.deleteUserInKeyclock).not.toHaveBeenCalled();
      expect(result).toEqual({ message: 'done', userId: 'kc-user-1' });
    });

    it('should roll back (delete) the keycloak user if a later step fails', async () => {
      mockKeyclockClient.createUserInKeyclock.mockResolvedValue('kc-user-2');
      mockKeyclockClient.getRoleByName.mockRejectedValue(
        new Error('role service down'),
      );
      mockKeyclockClient.deleteUserInKeyclock.mockResolvedValue(undefined);

      await expect(authService.signup(createUserDto as any)).rejects.toThrow(
        ConflictException,
      );

      expect(mockKeyclockClient.deleteUserInKeyclock).toHaveBeenCalledWith(
        'kc-user-2',
      );
      expect(mockUserServiceClient.saveUser).not.toHaveBeenCalled();
    });

    it('should still throw ConflictException (and log) if the rollback itself fails', async () => {
      mockKeyclockClient.createUserInKeyclock.mockResolvedValue('kc-user-3');
      mockKeyclockClient.getRoleByName.mockRejectedValue(
        new Error('role service down'),
      );
      mockKeyclockClient.deleteUserInKeyclock.mockRejectedValue(
        new Error('keycloak unreachable'),
      );

      await expect(authService.signup(createUserDto as any)).rejects.toThrow(
        ConflictException,
      );

      expect(mockKeyclockClient.deleteUserInKeyclock).toHaveBeenCalledWith(
        'kc-user-3',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL'),
      );
    });

    it('should not attempt a rollback if user creation in keycloak itself failed', async () => {
      mockKeyclockClient.createUserInKeyclock.mockRejectedValue(
        new Error('keycloak create failed'),
      );

      await expect(authService.signup(createUserDto as any)).rejects.toThrow(
        ConflictException,
      );

      expect(mockKeyclockClient.deleteUserInKeyclock).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // verifyResetPasswordToken — token verification logic
  // ---------------------------------------------------------------------
  describe('verifyResetPasswordToken', () => {
    it('should throw UnauthorizedException if the JWT is invalid/expired', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(
        authService.verifyResetPasswordToken('bad-token'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockUserServiceClient.getUserByEmail).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if token does not match stored resetPasswordToken', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        email: 'john@example.com',
      });
      mockUserServiceClient.getUserByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'john@example.com',
        resetPasswordToken: 'a-different-token',
      });

      await expect(
        authService.verifyResetPasswordToken('reset-token'),
      ).rejects.toThrow(UnauthorizedException);

      expect(
        mockUserServiceClient.updateResetPasswordProperty,
      ).not.toHaveBeenCalled();
    });

    it('should clear the stored token and issue a change-password token on success', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        email: 'john@example.com',
      });
      mockUserServiceClient.getUserByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'john@example.com',
        resetPasswordToken: 'reset-token',
      });
      mockUserServiceClient.updateResetPasswordProperty.mockResolvedValue(
        undefined,
      );
      mockJwtService.signAsync.mockResolvedValue('change-password-jwt');

      const result = await authService.verifyResetPasswordToken('reset-token');

      expect(
        mockUserServiceClient.updateResetPasswordProperty,
      ).toHaveBeenCalledWith('john@example.com', '');
      expect(mockJwtService.signAsync).toHaveBeenCalledWith(
        { userId: 'user-1' },
        {
          secret: 'change-password-secret',
          expiresIn: JWT_Change_PASSWORD_EXPIRY,
        },
      );
      expect(result).toBe('change-password-jwt');
    });
  });

  // ---------------------------------------------------------------------
  // changePassword — branch logic (reset-token path vs old-password path)
  // ---------------------------------------------------------------------
  describe('changePassword', () => {
    it('should change password via resetToken branch when resetToken is provided', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ userId: 'user-1' });
      mockKeyclockClient.changePassword.mockResolvedValue(undefined);

      const result = await authService.changePassword(
        'newPass123',
        null,
        null,
        'valid-reset-token',
      );

      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith(
        'valid-reset-token',
        { secret: 'change-password-secret' },
      );
      expect(mockKeyclockClient.changePassword).toHaveBeenCalledWith(
        'user-1',
        'newPass123',
      );
      expect(result).toEqual({ message: 'updated' });
    });

    it('should change password via oldPassword+access_token branch when resetToken is absent', async () => {
      mockJwtService.decode.mockReturnValue({
        sub: 'user-2',
        email: 'jane@example.com',
      });
      mockKeyclockClient.login.mockResolvedValue({
        access_token: 'session-token',
      });
      mockKeyclockClient.changePassword.mockResolvedValue(undefined);

      const result = await authService.changePassword(
        'newPass456',
        'oldPass456',
        'access-token-abc',
        null,
      );

      expect(mockJwtService.decode).toHaveBeenCalledWith('access-token-abc');
      expect(mockKeyclockClient.login).toHaveBeenCalledWith(
        'jane@example.com',
        'oldPass456',
      );
      expect(mockKeyclockClient.changePassword).toHaveBeenCalledWith(
        'user-2',
        'newPass456',
      );
      expect(result).toEqual({ message: 'updated' });
    });

    it('should throw BadRequestException when neither resetToken nor oldPassword/access_token are provided', async () => {
      await expect(
        authService.changePassword('newPass789', null, null, null),
      ).rejects.toThrow(BadRequestException);

      expect(mockKeyclockClient.changePassword).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if login (old-password verification) returns falsy', async () => {
      mockJwtService.decode.mockReturnValue({
        sub: 'user-3',
        email: 'bob@example.com',
      });
      mockKeyclockClient.login.mockResolvedValue(null);

      await expect(
        authService.changePassword(
          'newPassX',
          'wrongOldPass',
          'access-token-xyz',
          null,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockKeyclockClient.changePassword).not.toHaveBeenCalled();
    });

    it('should wrap unexpected errors from the resetToken branch as InternalServerErrorException', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(
        new Error('invalid signature'),
      );

      await expect(
        authService.changePassword('newPass', null, null, 'bad-reset-token'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should wrap unexpected errors from keyclockClient.changePassword as InternalServerErrorException', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ userId: 'user-4' });
      mockKeyclockClient.changePassword.mockRejectedValue(
        new Error('keycloak unavailable'),
      );

      await expect(
        authService.changePassword('newPass', null, null, 'valid-token'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
