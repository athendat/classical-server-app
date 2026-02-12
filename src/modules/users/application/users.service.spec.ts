import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersRepository } from '../infrastructure/adapters/users.repository';
import { User } from '../infrastructure/schemas/user.schema';
import { UserStatus } from '../domain/enums';
import { AsyncContextService } from 'src/common/context/async-context.service';
import { AuditService } from '../../audit/application/audit.service';

describe('UsersService', () => {
  let service: UsersService;
  let repository: UsersRepository;
  let mockUserModel: any;
  let mockEventEmitter: any;
  let mockConfigService: any;
  let mockAsyncContextService: any;
  let mockAuditService: any;

  const mockUser = {
    id: 'user-123',
    userId: 'user-123',
    email: 'test@example.com',
    fullname: 'Test User',
    roleKey: 'user',
    status: UserStatus.ACTIVE,
    passwordHash: 'hashed-password',
    isSystemAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockUserModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn(),
      countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue(null),
    };

    mockAsyncContextService = {
      getRequestId: jest.fn().mockReturnValue('test-request-id-123'),
      getActorId: jest.fn().mockReturnValue('admin-123'),
    };

    mockAuditService = {
      logAllow: jest.fn(),
      logDeny: jest.fn(),
      logError: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        UsersRepository,
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: AsyncContextService,
          useValue: mockAsyncContextService,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get<UsersRepository>(UsersRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new user successfully with ApiResponse', async () => {
      const createPayload = {
        email: 'test@example.com',
        fullname: 'Test User',
        roleKey: 'user',
        password: 'TestPassword123!',
        passwordHash: 'hashed-password',
      };

      jest.spyOn(repository, 'findById').mockResolvedValueOnce(null);
      jest.spyOn(repository, 'create').mockResolvedValueOnce(mockUser as any);

      const response = await service.create(createPayload);

      expect(response.ok).toBe(true);
      expect(response.statusCode).toBe(HttpStatus.CREATED);
      expect(response.data).toEqual({
        id: mockUser.id,
        userId: mockUser.userId,
        email: mockUser.email,
        fullname: mockUser.fullname,
        roleKey: mockUser.roleKey,
        status: mockUser.status,
        isSystemAdmin: mockUser.isSystemAdmin,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'user.created',
        expect.any(Object),
      );
      // Verificar que se registró auditoría
      expect(mockAuditService.logAllow).toHaveBeenCalledWith(
        'USER_CREATED',
        'user',
        expect.any(String),
        expect.objectContaining({
          module: 'users',
          severity: 'HIGH',
          tags: expect.arrayContaining(['user', 'creation']),
        }),
      );
    });

    it('should handle create errors with ApiResponse', async () => {
      const createPayload = {
        email: 'error@example.com',
        fullname: 'Error User',
        roleKey: 'user',
        password: 'TestPassword123!',
        passwordHash: 'hashed-password',
      };

      const error = new Error('Database error');
      jest.spyOn(repository, 'create').mockRejectedValueOnce(error);

      const response = await service.create(createPayload);

      expect(response.ok).toBe(false);
      expect(response.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      // Verificar auditoría de error
      expect(mockAuditService.logError).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should find a user by ID with ApiResponse', async () => {
      jest.spyOn(repository, 'findById').mockResolvedValueOnce(mockUser as any);

      const response = await service.findById('user-123');

      expect(response.ok).toBe(true);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toEqual({
        id: mockUser.id,
        userId: mockUser.userId,
        email: mockUser.email,
        fullname: mockUser.fullname,
        roleKey: mockUser.roleKey,
        status: mockUser.status,
        isSystemAdmin: mockUser.isSystemAdmin,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
      });
    });

    it('should return null if user not found with ApiResponse', async () => {
      jest.spyOn(repository, 'findById').mockResolvedValueOnce(null);

      const response = await service.findById('non-existent');

      expect(response.ok).toBe(true);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toBeNull();
    });

    it('should handle findById errors with ApiResponse', async () => {
      const error = new Error('Database error');
      jest.spyOn(repository, 'findById').mockRejectedValueOnce(error);

      const response = await service.findById('user-123');

      expect(response.ok).toBe(false);
      expect(response.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockAuditService.logError).toHaveBeenCalled();
    });
  });

  describe('findByEmail', () => {
    it('should find a user by email with ApiResponse', async () => {
      jest
        .spyOn(repository, 'findByEmail')
        .mockResolvedValueOnce(mockUser as any);

      const response = await service.findByEmail('test@example.com');

      expect(response.ok).toBe(true);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data?.email).toBe(mockUser.email);
      // Verificar auditoría de éxito
      expect(mockAuditService.logAllow).toHaveBeenCalledWith(
        'USER_FIND_BY_EMAIL',
        'user',
        expect.any(String),
        expect.objectContaining({
          module: 'users',
          severity: 'LOW',
          tags: expect.arrayContaining(['user', 'read', 'email_lookup']),
        }),
      );
    });

    it('should return null if user not found by email with ApiResponse', async () => {
      jest.spyOn(repository, 'findByEmail').mockResolvedValueOnce(null);

      const response = await service.findByEmail('nonexistent@example.com');

      expect(response.ok).toBe(true);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toBeNull();
      // Verificar auditoría de negación
      expect(mockAuditService.logDeny).toHaveBeenCalledWith(
        'USER_FIND_BY_EMAIL_NOT_FOUND',
        'user',
        expect.any(String),
        'User not found by email',
        expect.objectContaining({
          module: 'users',
          severity: 'LOW',
          tags: expect.arrayContaining(['user', 'read', 'email_lookup']),
        }),
      );
    });

    it('should handle findByEmail errors with ApiResponse', async () => {
      const error = new Error('Database error');
      jest.spyOn(repository, 'findByEmail').mockRejectedValueOnce(error);

      const response = await service.findByEmail('test@example.com');

      expect(response.ok).toBe(false);
      expect(response.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockAuditService.logError).toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('should list all active users with ApiResponse', async () => {
      const users = [mockUser];
      jest.spyOn(repository, 'findAll').mockResolvedValueOnce(users as any);

      const response = await service.list();

      expect(response.ok).toBe(true);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toHaveLength(1);
      expect(response.data![0].userId).toBe(mockUser.userId);
      // Verificar auditoría de listado - userId viene del contexto
      expect(mockAuditService.logAllow).toHaveBeenCalledWith(
        'USERS_LIST',
        'users',
        'admin-123',
        expect.any(Object),
      );
    });

    it('should filter out super_admin user from list', async () => {
      const superAdminUser = { ...mockUser, userId: 'super_admin', roleKey: 'super_admin' };
      const users = [mockUser, superAdminUser];
      jest.spyOn(repository, 'findAll').mockResolvedValueOnce(users as any);

      const response = await service.list();

      expect(response.ok).toBe(true);
      expect(response.data).toHaveLength(1);
      expect(response.data![0].roleKey).not.toBe('super_admin');
    });

    it('should handle list errors with ApiResponse', async () => {
      const error = new Error('Database error');
      jest.spyOn(repository, 'findAll').mockRejectedValueOnce(error);

      const response = await service.list();

      expect(response.ok).toBe(false);
      expect(response.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockAuditService.logError).toHaveBeenCalled();
    });
  });

  describe('updateRoles', () => {
    it('should update user role with ApiResponse and audit changes', async () => {
      const updatedUser = { ...mockUser, roleKey: 'admin' };
      jest.spyOn(repository, 'findById').mockResolvedValueOnce(mockUser as any);
      jest
        .spyOn(repository, 'updateRoles')
        .mockResolvedValueOnce(updatedUser as any);

      const response = await service.updateRoles('user-123', {
        roleKey: 'admin',
      });

      expect(response.ok).toBe(true);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data!.roleKey).toEqual('admin');
      // Verificar auditoría con cambios before/after - userId viene del contexto
      expect(mockAuditService.logAllow).toHaveBeenCalledWith(
        'USER_ROLE_UPDATED',
        'user',
        'admin-123',
        expect.objectContaining({
          module: 'users',
          severity: 'HIGH',
          changes: expect.objectContaining({
            before: expect.objectContaining({ roleKey: 'user' }),
            after: expect.objectContaining({ roleKey: 'admin' }),
          }),
        }),
      );
    });

    it('should fail if user not found with ApiResponse', async () => {
      jest.spyOn(repository, 'findById').mockResolvedValueOnce(null);

      const response = await service.updateRoles('non-existent', {
        roleKey: 'admin',
      });

      expect(response.ok).toBe(false);
      expect(response.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(response.errors).toContain('User not found');
      // Verificar auditoría de negación
      expect(mockAuditService.logDeny).toHaveBeenCalled();
    });

    it('should handle updateRoles errors with ApiResponse', async () => {
      const error = new Error('Database error');
      jest.spyOn(repository, 'findById').mockRejectedValueOnce(error);

      const response = await service.updateRoles('user-123', {
        roleKey: 'admin',
      });

      expect(response.ok).toBe(false);
      expect(response.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockAuditService.logError).toHaveBeenCalled();
    });
  });

  describe('updatePassword', () => {
    it('should update user password with ApiResponse and emit event', async () => {
      const updatedUser = { ...mockUser, updatedAt: new Date() };
      jest
        .spyOn(repository, 'updatePassword')
        .mockResolvedValueOnce(updatedUser as any);

      const response = await service.updatePassword('user-123', {
        password: 'new-password-123!',
      });

      expect(response.ok).toBe(true);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'user.password_changed',
        expect.any(Object),
      );
      // Verificar auditoría con severidad CRITICAL - userId viene del contexto
      expect(mockAuditService.logAllow).toHaveBeenCalledWith(
        'USER_PASSWORD_CHANGED',
        'user',
        'admin-123',
        expect.objectContaining({
          module: 'users',
          severity: 'CRITICAL',
          tags: expect.arrayContaining(['password_change']),
        }),
      );
    });

    it('should fail if user not found with ApiResponse', async () => {
      jest
        .spyOn(repository, 'updatePassword')
        .mockResolvedValueOnce(null);

      const response = await service.updatePassword('non-existent', {
        password: 'new-password-123!',
      });

      expect(response.ok).toBe(false);
      expect(response.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(response.errors).toContain('User not found');
      // Verificar auditoría de negación
      expect(mockAuditService.logDeny).toHaveBeenCalled();
    });

    it('should handle updatePassword errors with ApiResponse', async () => {
      const error = new Error('Database error');
      jest
        .spyOn(repository, 'updatePassword')
        .mockRejectedValueOnce(error);

      const response = await service.updatePassword('user-123', {
        password: 'new-password-123!',
      });

      expect(response.ok).toBe(false);
      expect(response.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockAuditService.logError).toHaveBeenCalled();
    });
  });

  describe('disable', () => {
    it('should disable a user with ApiResponse', async () => {
      jest.spyOn(repository, 'disable').mockResolvedValueOnce(true);

      const response = await service.disable('user-123');

      expect(response.ok).toBe(true);
      expect(response.statusCode).toBe(HttpStatus.NO_CONTENT);
      // Verificar auditoría - userId viene del contexto
      expect(mockAuditService.logAllow).toHaveBeenCalledWith(
        'USER_DISABLED',
        'user',
        'admin-123',
        expect.any(Object),
      );
    });

    it('should fail if user not found with ApiResponse', async () => {
      jest.spyOn(repository, 'disable').mockResolvedValueOnce(false);

      const response = await service.disable('non-existent');

      expect(response.ok).toBe(false);
      expect(response.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(response.errors).toContain('User not found');
      // Verificar auditoría de negación
      expect(mockAuditService.logDeny).toHaveBeenCalled();
    });

    it('should handle disable errors with ApiResponse', async () => {
      const error = new Error('Database error');
      jest.spyOn(repository, 'disable').mockRejectedValueOnce(error);

      const response = await service.disable('user-123');

      expect(response.ok).toBe(false);
      expect(response.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockAuditService.logError).toHaveBeenCalled();
    });
  });

  describe('onModuleInit & seedSuperAdminIfEmpty', () => {
    it('should create super_admin user if collection is empty and credentials are configured', async () => {
      const systemAdminId = '798bf39a-01cd-43ec-a17d-769d590a304f0'; // SYSTEM_ADMIN_ID
      mockUserModel.countDocuments = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });
      mockUserModel.create = jest.fn().mockResolvedValue({
        id: systemAdminId,
        userId: systemAdminId,
        email: 'admin@example.com',
        fullname: 'Super Administrator',
        roleKey: 'super_admin',
        status: 'active',
        isSystemAdmin: true,
      });
      mockConfigService.get.mockImplementation((key) => {
        if (key === 'SA_EMAIL') return 'admin@example.com';
        if (key === 'SA_PWD') return 'password123!';
        return null;
      });

      await service.onModuleInit();

      expect(mockUserModel.countDocuments).toHaveBeenCalled();
      expect(mockUserModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: systemAdminId,
          email: 'admin@example.com',
          fullname: 'Super Administrator',
          roleKey: 'super_admin',
          isSystemAdmin: true,
        }),
      );
    });

    it('should not create super_admin if collection is not empty', async () => {
      mockUserModel.countDocuments = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      });

      await service.onModuleInit();

      expect(mockUserModel.countDocuments).toHaveBeenCalled();
      expect(mockUserModel.create).not.toHaveBeenCalled();
    });

    it('should not create super_admin if credentials are not configured', async () => {
      mockUserModel.countDocuments = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });
      mockConfigService.get.mockReturnValue(null);

      await service.onModuleInit();

      expect(mockUserModel.countDocuments).toHaveBeenCalled();
      expect(mockUserModel.create).not.toHaveBeenCalled();
    });

    it('should handle errors during seed without throwing', async () => {
      mockUserModel.countDocuments = jest.fn().mockReturnValue({
        exec: jest.fn().mockRejectedValue(new Error('DB error')),
      });

      // Should not throw
      await expect(service.onModuleInit()).resolves.not.toThrow();
    });
  });

  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const password = 'MyPassword123!';
      const hash = await service.hashPassword(password);

      expect(hash).toBeTruthy();
      expect(hash).not.toBe(password);
    });
  });

  describe('verifyPassword', () => {
    it('should verify a correct password', async () => {
      const password = 'MyPassword123!';
      const hash = await service.hashPassword(password);

      const isValid = await service.verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should reject an incorrect password', async () => {
      const password = 'MyPassword123!';
      const hash = await service.hashPassword(password);

      const isValid = await service.verifyPassword('WrongPassword', hash);

      expect(isValid).toBe(false);
    });
  });
});
