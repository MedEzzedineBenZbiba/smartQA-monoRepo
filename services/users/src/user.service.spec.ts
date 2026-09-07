import { Test, TestingModule } from '@nestjs/testing';
import {
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { UserService } from './user.service';
import { User } from './entities/user.entity';
import { UserRole } from './entities/userRole.enum';
import { In, Not } from 'typeorm';

describe('UserService', () => {
  let service: UserService;

  // ── chainable query builder mock ─────────────────────────────────────────
  const makeQueryBuilder = (resolvedValue: any) => {
    const qb: any = {
      select: jest.fn(() => qb),
      addSelect: jest.fn(() => qb),
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      groupBy: jest.fn(() => qb),
      orderBy: jest.fn(() => qb),
      getRawMany: jest.fn().mockResolvedValue(resolvedValue),
      getMany: jest.fn().mockResolvedValue(resolvedValue),
    };
    return qb;
  };

  const mockUserRepository = {
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    update: jest.fn(),
  };

  const mockJwtService = {
    verifyAsync: jest.fn(),
  };

  const mockLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('reset-password-secret'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: JwtService, useValue: mockJwtService },
        { provide: Logger, useValue: mockLogger },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------
  // getDashboardStats
  // ---------------------------------------------------------------------
  describe('getDashboardStats', () => {
    it('should return total, byRole, and byGender stats', async () => {
      mockUserRepository.count.mockResolvedValue(10);

      const roleQb = makeQueryBuilder([
        { role: 'user', count: '7' },
        { role: 'admin', count: '3' },
      ]);
      const genderQb = makeQueryBuilder([
        { gender: 'male', count: '6' },
        { gender: 'female', count: '4' },
      ]);

      mockUserRepository.createQueryBuilder
        .mockReturnValueOnce(roleQb)
        .mockReturnValueOnce(genderQb);

      const result = await service.getDashboardStats();

      expect(mockUserRepository.count).toHaveBeenCalledWith({
        where: { role: Not(UserRole.Superadmin) },
      });
      expect(result).toEqual({
        total: 10,
        byRole: { user: 7, admin: 3 },
        byGender: { male: 6, female: 4 },
      });
    });

    // NOTE: this Promise.all has 3 branches (count, role queryBuilder,
    // getGenderStats → its own queryBuilder). Even when testing a failure
    // in one branch, the OTHER branches must still resolve successfully —
    // otherwise a resetted mock (via afterEach's jest.clearAllMocks())
    // returns `undefined` from createQueryBuilder(), which throws
    // synchronously on `.select(...)` and orphans the rejected `count()`
    // promise, crashing the process under Node's unhandled-rejection
    // handling instead of failing the test cleanly.
    it('should wrap errors as InternalServerErrorException', async () => {
      mockUserRepository.count.mockRejectedValue(new Error('db down'));

      const roleQb = makeQueryBuilder([]);
      const genderQb = makeQueryBuilder([]);
      mockUserRepository.createQueryBuilder
        .mockReturnValueOnce(roleQb)
        .mockReturnValueOnce(genderQb);

      await expect(service.getDashboardStats()).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should rethrow NotFoundException as-is', async () => {
      mockUserRepository.count.mockRejectedValue(
        new NotFoundException('not found'),
      );

      const roleQb = makeQueryBuilder([]);
      const genderQb = makeQueryBuilder([]);
      mockUserRepository.createQueryBuilder
        .mockReturnValueOnce(roleQb)
        .mockReturnValueOnce(genderQb);

      await expect(service.getDashboardStats()).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------
  // getGenderStats
  // ---------------------------------------------------------------------
  describe('getGenderStats', () => {
    it('should tally male and female counts, ignoring unrelated genders', async () => {
      const qb = makeQueryBuilder([
        { gender: 'male', count: '5' },
        { gender: 'female', count: '2' },
        { gender: 'other', count: '1' },
      ]);
      mockUserRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getGenderStats();

      expect(result).toEqual({ male: 5, female: 2 });
    });

    it('should default to zero counts when no rows are returned', async () => {
      const qb = makeQueryBuilder([]);
      mockUserRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getGenderStats();

      expect(result).toEqual({ male: 0, female: 0 });
    });

    it('should wrap errors as InternalServerErrorException', async () => {
      const qb = makeQueryBuilder(null);
      qb.getRawMany.mockRejectedValue(new Error('db down'));
      mockUserRepository.createQueryBuilder.mockReturnValue(qb);

      await expect(service.getGenderStats()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ---------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------
  describe('create', () => {
    const dto = {
      username: 'john',
      email: 'john@example.com',
      password: 'pass123',
    };

    it('should create and save a new user', async () => {
      mockUserRepository.create.mockReturnValue({ id: 'u1', ...dto });
      mockUserRepository.save.mockResolvedValue({ id: 'u1', ...dto });

      const result = await service.create(dto as any);

      expect(mockUserRepository.create).toHaveBeenCalledWith(dto);
      expect(mockUserRepository.save).toHaveBeenCalledWith({
        id: 'u1',
        ...dto,
      });
      expect(result).toEqual({ id: 'u1', ...dto });
    });

    it('should wrap errors as InternalServerErrorException', async () => {
      mockUserRepository.create.mockReturnValue(dto);
      mockUserRepository.save.mockRejectedValue(new Error('duplicate key'));

      await expect(service.create(dto as any)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ---------------------------------------------------------------------
  // getRecentHires
  // ---------------------------------------------------------------------
  describe('getRecentHires', () => {
    it('should return users hired in the last 3 months, excluding superadmins', async () => {
      const qb = makeQueryBuilder([{ id: 'u1' }, { id: 'u2' }]);
      mockUserRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getRecentHires();

      expect(qb.where).toHaveBeenCalledWith(
        'user.createdAt >= :threeMonthsAgo',
        expect.objectContaining({ threeMonthsAgo: expect.any(Date) }),
      );
      expect(qb.andWhere).toHaveBeenCalledWith('user.role != :role', {
        role: 'superadmin',
      });
      expect(result).toEqual([{ id: 'u1' }, { id: 'u2' }]);
    });

    it('should wrap errors as InternalServerErrorException', async () => {
      const qb = makeQueryBuilder(null);
      qb.getMany.mockRejectedValue(new Error('db down'));
      mockUserRepository.createQueryBuilder.mockReturnValue(qb);

      await expect(service.getRecentHires()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ---------------------------------------------------------------------
  // getUserByEmail
  // ---------------------------------------------------------------------
  describe('getUserByEmail', () => {
    it('should return the user when found', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        id: 'u1',
        email: 'john@example.com',
      });

      const result = await service.getUserByEmail('john@example.com');

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'john@example.com' },
      });
      expect(result).toEqual({ id: 'u1', email: 'john@example.com' });
    });

    it('should throw NotFoundException when no user is found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getUserByEmail('missing@example.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should wrap repository errors as InternalServerErrorException', async () => {
      mockUserRepository.findOne.mockRejectedValue(new Error('db down'));

      await expect(service.getUserByEmail('john@example.com')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ---------------------------------------------------------------------
  // getUserById
  // ---------------------------------------------------------------------
  describe('getUserById', () => {
    it('should return the user when found', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: 'u1' });

      const result = await service.getUserById('u1');

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'u1' },
      });
      expect(result).toEqual({ id: 'u1' });
    });

    it('should throw NotFoundException when no user is found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.getUserById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should wrap repository errors as InternalServerErrorException', async () => {
      mockUserRepository.findOne.mockRejectedValue(new Error('db down'));

      await expect(service.getUserById('u1')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ---------------------------------------------------------------------
  // getUserByUsername
  // ---------------------------------------------------------------------
  describe('getUserByUsername', () => {
    it('should return the user when found', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        id: 'u1',
        username: 'john',
      });

      const result = await service.getUserByUsername('john');

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { username: 'john' },
      });
      expect(result).toEqual({ id: 'u1', username: 'john' });
    });

    it('should throw NotFoundException when no user is found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.getUserByUsername('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should wrap unexpected repository errors as InternalServerErrorException', async () => {
      mockUserRepository.findOne.mockRejectedValue(new Error('db down'));

      await expect(service.getUserByUsername('john')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ---------------------------------------------------------------------
  // findAll
  // ---------------------------------------------------------------------
  describe('findAll', () => {
    it('should return paginated results with default params', async () => {
      mockUserRepository.findAndCount.mockResolvedValue([[{ id: 'u1' }], 1]);

      const result = await service.findAll();

      expect(mockUserRepository.findAndCount).toHaveBeenCalledWith({
        where: {},
        take: 20,
        skip: 0,
      });
      expect(result).toEqual({ data: [{ id: 'u1' }], total: 1, totalPages: 1 });
    });

    it('should build an ILike OR filter when search is provided', async () => {
      mockUserRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll(2, 10, 'john', ['admin']);

      expect(mockUserRepository.findAndCount).toHaveBeenCalledWith({
        where: [
          { username: expect.anything(), role: In(['admin']) },
          { email: expect.anything(), role: In(['admin']) },
        ],
        take: 10,
        skip: 10,
      });
    });

    it('should filter by role only when no search term is given', async () => {
      mockUserRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll(1, 20, '', ['admin', 'user']);

      expect(mockUserRepository.findAndCount).toHaveBeenCalledWith({
        where: { role: In(['admin', 'user']) },
        take: 20,
        skip: 0,
      });
    });

    it('should compute totalPages correctly', async () => {
      mockUserRepository.findAndCount.mockResolvedValue([[], 25]);

      const result = await service.findAll(1, 10);

      expect(result.totalPages).toBe(3);
    });

    it('should wrap errors as InternalServerErrorException', async () => {
      mockUserRepository.findAndCount.mockRejectedValue(new Error('db down'));

      await expect(service.findAll()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ---------------------------------------------------------------------
  // updateLastIngestionDate
  // ---------------------------------------------------------------------
  describe('updateLastIngestionDate', () => {
    it('should update the last ingestion date when the user exists', async () => {
      mockUserRepository.update.mockResolvedValue({ affected: 1 });

      await service.updateLastIngestionDate(new Date(), 'u1');

      expect(mockUserRepository.update).toHaveBeenCalledWith(
        { id: 'u1' },
        { lastIngestionDate: expect.any(Date) },
      );
    });

    it('should throw NotFoundException when no rows are affected', async () => {
      mockUserRepository.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.updateLastIngestionDate(new Date(), 'missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should wrap repository errors as InternalServerErrorException', async () => {
      mockUserRepository.update.mockRejectedValue(new Error('db down'));

      await expect(
        service.updateLastIngestionDate(new Date(), 'u1'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ---------------------------------------------------------------------
  // getLastIngestionDate
  // ---------------------------------------------------------------------
  describe('getLastIngestionDate', () => {
    it('should return the last ingestion date when the user exists', async () => {
      const date = new Date();
      mockUserRepository.findOne.mockResolvedValue({
        id: 'u1',
        lastIngestionDate: date,
      });

      const result = await service.getLastIngestionDate('u1');

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'u1' },
        select: { id: true, lastIngestionDate: true },
      });
      expect(result).toBe(date);
    });

    it('should throw NotFoundException when the user does not exist', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.getLastIngestionDate('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should wrap unexpected repository errors as InternalServerErrorException', async () => {
      mockUserRepository.findOne.mockRejectedValue(new Error('db down'));

      await expect(service.getLastIngestionDate('u1')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ---------------------------------------------------------------------
  // updateResetPasswordToken
  // ---------------------------------------------------------------------
  describe('updateResetPasswordToken', () => {
    it('should verify the token and update it when a token is provided', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        email: 'john@example.com',
      });
      mockUserRepository.update.mockResolvedValue({ affected: 1 });

      await service.updateResetPasswordToken('john@example.com', 'reset-token');

      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith('reset-token', {
        secret: 'reset-password-secret',
      });
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        { email: 'john@example.com' },
        { resetPasswordToken: 'reset-token' },
      );
    });

    it('should clear the token without verifying when resetPasswordToken is empty', async () => {
      mockUserRepository.update.mockResolvedValue({ affected: 1 });

      await service.updateResetPasswordToken('john@example.com', '');

      expect(mockJwtService.verifyAsync).not.toHaveBeenCalled();
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        { email: 'john@example.com' },
        { resetPasswordToken: '' },
      );
    });

    it('should throw NotFoundException when no rows are affected', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        email: 'john@example.com',
      });
      mockUserRepository.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.updateResetPasswordToken('john@example.com', 'reset-token'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should wrap JWT verification failures as InternalServerErrorException', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('invalid token'));

      await expect(
        service.updateResetPasswordToken('john@example.com', 'bad-token'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should wrap unexpected repository errors as InternalServerErrorException', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        email: 'john@example.com',
      });
      mockUserRepository.update.mockRejectedValue(new Error('db down'));

      await expect(
        service.updateResetPasswordToken('john@example.com', 'reset-token'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
