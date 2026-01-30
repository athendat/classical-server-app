import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HttpStatus } from '@nestjs/common';
import { RolesService } from './roles.service';
import { MongoDBRolesRepository } from '../infrastructure/adapters';
import { AsyncContextService } from 'src/common/context/async-context.service';
import { AuditService } from 'src/modules/audit/application/audit.service';
import { RoleStatus } from '../domain/role.enums';
import { CreateRoleDto, UpdateRoleDto } from '../dto';

describe('RolesService', () => {
  let service: RolesService;
  let rolesRepository: MongoDBRolesRepository;
  let eventEmitter: EventEmitter2;
  let asyncContextService: AsyncContextService;
  let auditService: AuditService;

  const mockRole = {
    id: 'role-123',
    key: 'admin',
    name: 'Administrator',
    icon: 'admin_panel_settings',
    description: 'Administrator role with full permissions',
    permissionKeys: ['modules.read', 'modules.create', 'modules.delete'],
    status: RoleStatus.ACTIVE,
    isSystem: false,
    assignedUsersCount: 5,
    createdAt: new Date('2025-01-15'),
    updatedAt: new Date('2025-01-15'),
  };

  const mockSystemRole = {
    id: 'role-system-123',
    key: 'system_admin',
    name: 'System Administrator',
    icon: 'security_admin',
    description: 'System Administrator role',
    permissionKeys: ['*'],
    status: RoleStatus.ACTIVE,
    isSystem: true,
    assignedUsersCount: 2,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-15'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        {
          provide: MongoDBRolesRepository,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findById: jest.fn(),
            findByKey: jest.fn(),
            update: jest.fn(),
            disable: jest.fn(),
            delete: jest.fn(),
            findSystemRoles: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: AsyncContextService,
          useValue: {
            getRequestId: jest.fn().mockReturnValue('req-123'),
          },
        },
        {
          provide: AuditService,
          useValue: {
            logAllow: jest.fn(),
            logError: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
    rolesRepository = module.get<MongoDBRolesRepository>(MongoDBRolesRepository);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    asyncContextService = module.get<AsyncContextService>(AsyncContextService);
    auditService = module.get<AuditService>(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('service initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have all required methods', () => {
      expect(service.create).toBeDefined();
      expect(service.findAll).toBeDefined();
      expect(service.findById).toBeDefined();
      expect(service.findByKey).toBeDefined();
      expect(service.update).toBeDefined();
      expect(service.disable).toBeDefined();
      expect(service.hardDelete).toBeDefined();
      expect(service.findSystemRoles).toBeDefined();
    });
  });

  describe('create', () => {
    const createRoleDto: CreateRoleDto = {
      key: 'editor',
      name: 'Editor',
      icon: 'edit',
      description: 'Editor role',
      permissionKeys: ['modules.read', 'modules.update'],
    };

    it('should create a new role successfully', async () => {
      const createdRole = { ...mockRole, key: 'editor', name: 'Editor' };
      jest.spyOn(rolesRepository, 'findByKey').mockResolvedValueOnce(null);
      jest.spyOn(rolesRepository, 'create').mockResolvedValueOnce(createdRole as any);

      const result = await service.create(createRoleDto);

      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(HttpStatus.CREATED);
      expect(result.data).toEqual(createdRole);
      expect(result.message).toBe('Rol creado exitosamente');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'roles.role_created',
        expect.any(Object),
      );
      expect(auditService.logAllow).toHaveBeenCalled();
    });

    it('should fail if role already exists', async () => {
      jest.spyOn(rolesRepository, 'findByKey').mockResolvedValueOnce(mockRole as any);

      const result = await service.create(createRoleDto);

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(result.errors).toBe('ROLE_ALREADY_EXISTS');
      expect(auditService.logError).toHaveBeenCalled();
    });

    it('should normalize and trim the role key', async () => {
      const dtoWithSpaces = { ...createRoleDto, key: '  EDITOR  ' };
      jest.spyOn(rolesRepository, 'findByKey').mockResolvedValueOnce(null);
      jest.spyOn(rolesRepository, 'create').mockResolvedValueOnce(mockRole as any);

      await service.create(dtoWithSpaces);

      expect(rolesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'editor',
        }),
      );
    });

    it('should handle repository errors gracefully', async () => {
      jest.spyOn(rolesRepository, 'findByKey').mockResolvedValueOnce(null);
      jest
        .spyOn(rolesRepository, 'create')
        .mockRejectedValueOnce(new Error('Database error'));

      const result = await service.create(createRoleDto);

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(auditService.logError).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all active roles from database', async () => {
      const roles = [mockRole, mockSystemRole];
      jest.spyOn(rolesRepository, 'findAll').mockResolvedValueOnce(roles as any);

      const result = await service.findAll();

      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data).toEqual(roles);
      expect(result.meta.cached).toBe(false);
      expect(auditService.logAllow).toHaveBeenCalled();
    });

    it('should return cached roles within TTL', async () => {
      const roles = [mockRole];
      jest.spyOn(rolesRepository, 'findAll').mockResolvedValueOnce(roles as any);

      const result1 = await service.findAll();
      expect(result1.meta.cached).toBe(false);

      const result2 = await service.findAll();
      expect(result2.meta.cached).toBe(true);
      expect(result2.data).toEqual(roles);
      expect(rolesRepository.findAll).toHaveBeenCalledTimes(1);
    });

    it('should handle repository errors gracefully', async () => {
      jest
        .spyOn(rolesRepository, 'findAll')
        .mockRejectedValueOnce(new Error('Database error'));

      const result = await service.findAll();

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(auditService.logError).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should find a role by ID', async () => {
      jest.spyOn(rolesRepository, 'findById').mockResolvedValueOnce(mockRole as any);

      const result = await service.findById('role-123');

      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data).toEqual(mockRole);
      expect(auditService.logAllow).toHaveBeenCalled();
    });

    it('should return not found error when role does not exist', async () => {
      jest.spyOn(rolesRepository, 'findById').mockResolvedValueOnce(null);

      const result = await service.findById('non-existent');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(result.errors).toBe('ROLE_NOT_FOUND');
      expect(auditService.logError).toHaveBeenCalled();
    });

    it('should handle repository errors gracefully', async () => {
      jest
        .spyOn(rolesRepository, 'findById')
        .mockRejectedValueOnce(new Error('Database error'));

      const result = await service.findById('role-123');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(auditService.logError).toHaveBeenCalled();
    });
  });

  describe('findByKey', () => {
    it('should find a role by key', async () => {
      jest.spyOn(rolesRepository, 'findByKey').mockResolvedValueOnce(mockRole as any);

      const result = await service.findByKey('admin');

      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data).toEqual(mockRole);
      expect(auditService.logAllow).toHaveBeenCalled();
    });

    it('should return not found error when role key does not exist', async () => {
      jest.spyOn(rolesRepository, 'findByKey').mockResolvedValueOnce(null);

      const result = await service.findByKey('non-existent');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(result.errors).toBe('ROLE_NOT_FOUND');
      expect(auditService.logError).toHaveBeenCalled();
    });

    it('should handle repository errors gracefully', async () => {
      jest
        .spyOn(rolesRepository, 'findByKey')
        .mockRejectedValueOnce(new Error('Database error'));

      const result = await service.findByKey('admin');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(auditService.logError).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const updateRoleDto: UpdateRoleDto = {
      name: 'Super Admin',
      description: 'Updated description',
      permissionKeys: ['modules.read', 'modules.create', 'modules.delete', 'audit.read'],
    };

    it('should update a role successfully', async () => {
      const updatedRole = { ...mockRole, ...updateRoleDto };
      jest.spyOn(rolesRepository, 'findById').mockResolvedValueOnce(mockRole as any);
      jest.spyOn(rolesRepository, 'update').mockResolvedValueOnce(updatedRole as any);

      const result = await service.update('role-123', updateRoleDto);

      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data).toEqual(updatedRole);
      expect(result.message).toBe('Rol actualizado exitosamente');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'roles.role_updated',
        expect.any(Object),
      );
      expect(auditService.logAllow).toHaveBeenCalled();
    });

    it('should fail when role is not found', async () => {
      jest.spyOn(rolesRepository, 'findById').mockResolvedValueOnce(null);

      const result = await service.update('non-existent', updateRoleDto);

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('should return error when update fails', async () => {
      jest.spyOn(rolesRepository, 'findById').mockResolvedValueOnce(mockRole as any);
      jest.spyOn(rolesRepository, 'update').mockResolvedValueOnce(null);

      const result = await service.update('role-123', updateRoleDto);

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(auditService.logError).toHaveBeenCalled();
    });

    it('should handle repository errors gracefully', async () => {
      jest.spyOn(rolesRepository, 'findById').mockResolvedValueOnce(mockRole as any);
      jest
        .spyOn(rolesRepository, 'update')
        .mockRejectedValueOnce(new Error('Database error'));

      const result = await service.update('role-123', updateRoleDto);

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(auditService.logError).toHaveBeenCalled();
    });
  });

  describe('disable', () => {
    it('should disable a non-system role successfully', async () => {
      const disabledRole = { ...mockRole, status: RoleStatus.DISABLED };
      jest.spyOn(rolesRepository, 'findById').mockResolvedValueOnce(mockRole as any);
      jest.spyOn(rolesRepository, 'disable').mockResolvedValueOnce(disabledRole as any);

      const result = await service.disable('role-123');

      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data.status).toBe(RoleStatus.DISABLED);
      expect(result.message).toBe('Rol deshabilitado exitosamente');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'roles.role_disabled',
        expect.any(Object),
      );
      expect(auditService.logAllow).toHaveBeenCalled();
    });

    it('should fail when trying to disable a system role', async () => {
      jest.spyOn(rolesRepository, 'findById').mockResolvedValueOnce(mockSystemRole as any);

      const result = await service.disable('system-role-123');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(result.errors).toBe('CANNOT_DISABLE_SYSTEM_ROLE');
      expect(rolesRepository.disable).not.toHaveBeenCalled();
      expect(auditService.logError).toHaveBeenCalled();
    });

    it('should fail when role is not found', async () => {
      jest.spyOn(rolesRepository, 'findById').mockResolvedValueOnce(null);

      const result = await service.disable('non-existent');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('should fail when disable returns null', async () => {
      jest.spyOn(rolesRepository, 'findById').mockResolvedValueOnce(mockRole as any);
      jest.spyOn(rolesRepository, 'disable').mockResolvedValueOnce(null);

      const result = await service.disable('role-123');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(auditService.logError).toHaveBeenCalled();
    });

    it('should handle repository errors gracefully', async () => {
      jest.spyOn(rolesRepository, 'findById').mockResolvedValueOnce(mockRole as any);
      jest
        .spyOn(rolesRepository, 'disable')
        .mockRejectedValueOnce(new Error('Database error'));

      const result = await service.disable('role-123');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(auditService.logError).toHaveBeenCalled();
    });
  });

  describe('hardDelete', () => {
    it('should hard delete a disabled non-system role', async () => {
      const disabledRole = { ...mockRole, status: RoleStatus.DISABLED };
      jest.spyOn(rolesRepository, 'findById').mockResolvedValueOnce(disabledRole as any);
      jest.spyOn(rolesRepository, 'delete').mockResolvedValueOnce(true);

      const result = await service.hardDelete('role-123');

      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(HttpStatus.NO_CONTENT);
      expect(result.data).toBe('role-123');
      expect(result.message).toBe('Rol eliminado exitosamente');
      expect(auditService.logAllow).toHaveBeenCalled();
    });

    it('should fail when trying to delete a system role', async () => {
      jest.spyOn(rolesRepository, 'findById').mockResolvedValueOnce(mockSystemRole as any);

      const result = await service.hardDelete('system-role-123');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(result.errors).toBe('CANNOT_DELETE_SYSTEM_ROLE');
      expect(rolesRepository.delete).not.toHaveBeenCalled();
      expect(auditService.logError).toHaveBeenCalled();
    });

    it('should fail when trying to delete an active role', async () => {
      jest.spyOn(rolesRepository, 'findById').mockResolvedValueOnce(mockRole as any);

      const result = await service.hardDelete('role-123');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(result.errors).toBe('ROLE_MUST_BE_DISABLED');
      expect(rolesRepository.delete).not.toHaveBeenCalled();
      expect(auditService.logError).toHaveBeenCalled();
    });

    it('should fail when role is not found', async () => {
      jest.spyOn(rolesRepository, 'findById').mockResolvedValueOnce(null);

      const result = await service.hardDelete('non-existent');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('should fail when delete operation fails', async () => {
      const disabledRole = { ...mockRole, status: RoleStatus.DISABLED };
      jest.spyOn(rolesRepository, 'findById').mockResolvedValueOnce(disabledRole as any);
      jest.spyOn(rolesRepository, 'delete').mockResolvedValueOnce(false);

      const result = await service.hardDelete('role-123');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(auditService.logError).toHaveBeenCalled();
    });

    it('should handle repository errors gracefully', async () => {
      const disabledRole = { ...mockRole, status: RoleStatus.DISABLED };
      jest.spyOn(rolesRepository, 'findById').mockResolvedValueOnce(disabledRole as any);
      jest
        .spyOn(rolesRepository, 'delete')
        .mockRejectedValueOnce(new Error('Database error'));

      const result = await service.hardDelete('role-123');

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(auditService.logError).toHaveBeenCalled();
    });
  });

  describe('findSystemRoles', () => {
    it('should return all system roles', async () => {
      const systemRoles = [mockSystemRole];
      jest.spyOn(rolesRepository, 'findSystemRoles').mockResolvedValueOnce(systemRoles as any);

      const result = await service.findSystemRoles();

      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data).toEqual(systemRoles);
      expect(result.message).toBe('Roles del sistema obtenidos exitosamente');
      expect(auditService.logAllow).toHaveBeenCalled();
    });

    it('should return empty array when no system roles exist', async () => {
      jest.spyOn(rolesRepository, 'findSystemRoles').mockResolvedValueOnce([]);

      const result = await service.findSystemRoles();

      expect(result.ok).toBe(true);
      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data).toEqual([]);
    });

    it('should handle repository errors gracefully', async () => {
      jest
        .spyOn(rolesRepository, 'findSystemRoles')
        .mockRejectedValueOnce(new Error('Database error'));

      const result = await service.findSystemRoles();

      expect(result.ok).toBe(false);
      expect(result.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(result.message).toBe('Error al obtener roles del sistema');
      expect(auditService.logError).toHaveBeenCalled();
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete role lifecycle: create -> read -> update -> disable -> delete', async () => {
      const createDto = {
        key: 'test-role',
        name: 'Test Role',
        description: 'Test role for lifecycle',
        permissionKeys: ['test.read'],
      };

      const createdRole = {
        ...mockRole,
        key: 'test-role',
        name: 'Test Role',
        status: RoleStatus.ACTIVE,
      };

      const updateDto = { name: 'Updated Test Role' };
      const updatedRole = { ...createdRole, ...updateDto };
      const disabledRole = { ...updatedRole, status: RoleStatus.DISABLED };

      // Create
      jest.spyOn(rolesRepository, 'findByKey').mockResolvedValueOnce(null);
      jest.spyOn(rolesRepository, 'create').mockResolvedValueOnce(createdRole as any);
      const createResult = await service.create(createDto);
      expect(createResult.ok).toBe(true);

      // Read
      jest.spyOn(rolesRepository, 'findById').mockResolvedValueOnce(createdRole as any);
      const readResult = await service.findById('role-123');
      expect(readResult.ok).toBe(true);

      // Update
      jest.spyOn(rolesRepository, 'findById').mockResolvedValueOnce(createdRole as any);
      jest.spyOn(rolesRepository, 'update').mockResolvedValueOnce(updatedRole as any);
      const updateResult = await service.update('role-123', updateDto);
      expect(updateResult.ok).toBe(true);

      // Disable
      jest.spyOn(rolesRepository, 'findById').mockResolvedValueOnce(updatedRole as any);
      jest.spyOn(rolesRepository, 'disable').mockResolvedValueOnce(disabledRole as any);
      const disableResult = await service.disable('role-123');
      expect(disableResult.ok).toBe(true);

      // Delete
      jest.spyOn(rolesRepository, 'findById').mockResolvedValueOnce(disabledRole as any);
      jest.spyOn(rolesRepository, 'delete').mockResolvedValueOnce(true);
      const deleteResult = await service.hardDelete('role-123');
      expect(deleteResult.ok).toBe(true);
    });

    it('should properly audit all operations', async () => {
      const createDto = {
        key: 'audit-test-role',
        name: 'Audit Test Role',
        permissionKeys: ['audit.read'],
      };

      jest.spyOn(rolesRepository, 'findByKey').mockResolvedValueOnce(null);
      jest.spyOn(rolesRepository, 'create').mockResolvedValueOnce({
        ...mockRole,
        key: 'audit-test-role',
      } as any);

      await service.create(createDto);

      expect(auditService.logAllow).toHaveBeenCalledWith(
        'ROLE_CREATED',
        'role',
        expect.any(String),
        expect.objectContaining({
          module: 'roles',
          severity: 'HIGH',
          tags: expect.arrayContaining(['role', 'creation', 'security']),
        }),
      );
    });
  });

  describe('Cache management', () => {
    it('should have TTL for cache', async () => {
      const roles = [mockRole];
      jest.spyOn(rolesRepository, 'findAll').mockResolvedValueOnce(roles as any);

      const result1 = await service.findAll();
      expect(result1.meta.cached).toBe(false);

      const result2 = await service.findAll();
      expect(result2.meta.cached).toBe(true);
      expect(rolesRepository.findAll).toHaveBeenCalledTimes(1);
    });

    it('should invalidate cache on create', async () => {
      jest.spyOn(rolesRepository, 'findAll').mockResolvedValueOnce([mockRole] as any);
      jest.spyOn(rolesRepository, 'findByKey').mockResolvedValueOnce(null);
      jest.spyOn(rolesRepository, 'create').mockResolvedValueOnce(mockRole as any);

      await service.findAll();

      await service.create({
        key: 'new-role',
        name: 'New Role',
        permissionKeys: [],
      });

      jest.spyOn(rolesRepository, 'findAll').mockResolvedValueOnce([mockRole] as any);
      const result = await service.findAll();
      expect(result.meta.cached).toBe(false);
    });
  });
});
