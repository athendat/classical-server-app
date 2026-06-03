import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { UsersService } from './users.service';
import { UsersRepository } from '../infrastructure/adapters/users.repository';
import { UserLifecycleRepository } from '../infrastructure/adapters/user-lifecycle.repository';
import { AsyncContextService } from 'src/common/context/async-context.service';
import { AuditService } from '../../audit/application/audit.service';
import { CreateUserDto } from '../dto';

/**
 * Tenant-scoped user management (merchant gestiona usuarios de su propio tenant).
 *
 * Regla de aislamiento: el tenantId SIEMPRE se deriva del contexto del actor
 * (JWT), NUNCA del payload del cliente. Un actor sin tenant no puede crear.
 */
describe('UsersService — tenant-scoped create', () => {
    let service: UsersService;
    let repoCreate: jest.Mock;
    let repoFindAll: jest.Mock;
    let getTenantId: jest.Mock;

    const baseDto = {
        email: 'cashier@shop.com',
        fullname: 'Cashier One',
        roleKey: 'user',
        phone: '50912345',
        idNumber: '12345678901',
        password: 'P@ssw0rd2',
    } as unknown as CreateUserDto;

    beforeEach(async () => {
        repoCreate = jest.fn().mockResolvedValue({
            id: 'new-user-1',
            email: baseDto.email,
            fullname: baseDto.fullname,
            roleKey: 'user',
            status: 'active',
        });
        repoFindAll = jest.fn().mockResolvedValue({ data: [], total: 0, meta: {} });
        getTenantId = jest.fn().mockReturnValue('tenant-1');

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UsersService,
                { provide: UsersRepository, useValue: { create: repoCreate, findAll: repoFindAll } },
                { provide: UserLifecycleRepository, useValue: {} },
                { provide: EventEmitter2, useValue: { emit: jest.fn() } },
                {
                    provide: AsyncContextService,
                    useValue: {
                        getRequestId: jest.fn().mockReturnValue('req-1'),
                        getActorId: jest.fn().mockReturnValue('merchant-1'),
                        getTenantId,
                    },
                },
                { provide: AuditService, useValue: { logAllow: jest.fn(), logError: jest.fn(), logDeny: jest.fn() } },
            ],
        }).compile();

        service = module.get(UsersService);
    });

    it('asigna el tenantId del contexto al crear el usuario', async () => {
        await service.createTenantUser(baseDto);

        expect(repoCreate).toHaveBeenCalledTimes(1);
        expect(repoCreate.mock.calls[0][0]).toMatchObject({ tenantId: 'tenant-1' });
    });

    it('IGNORA un tenantId enviado por el cliente (anti cross-tenant)', async () => {
        const dtoWithEvilTenant = { ...baseDto, tenantId: 'tenant-EVIL' } as unknown as CreateUserDto;

        await service.createTenantUser(dtoWithEvilTenant);

        expect(repoCreate.mock.calls[0][0]).toMatchObject({ tenantId: 'tenant-1' });
    });

    it('falla-cerrado (403) y NO crea si el actor no tiene tenant', async () => {
        getTenantId.mockReturnValue(undefined);

        const res = await service.createTenantUser(baseDto);

        expect(res.statusCode).toBe(403);
        expect(repoCreate).not.toHaveBeenCalled();
    });

    it('RECHAZA (403) un roleKey fuera de la whitelist de negocio (anti escalada) y NO crea', async () => {
        const escalation = { ...baseDto, roleKey: 'admin' } as unknown as CreateUserDto;

        const res = await service.createTenantUser(escalation);

        expect(res.statusCode).toBe(403);
        expect(repoCreate).not.toHaveBeenCalled();
    });

    it('RECHAZA (403) additionalRoleKeys fuera de la whitelist (e.g. super_admin) y NO crea', async () => {
        const escalation = {
            ...baseDto,
            roleKey: 'user',
            additionalRoleKeys: ['super_admin'],
        } as unknown as CreateUserDto;

        const res = await service.createTenantUser(escalation);

        expect(res.statusCode).toBe(403);
        expect(repoCreate).not.toHaveBeenCalled();
    });

    it('permite un roleKey de negocio de la whitelist (developer)', async () => {
        const dto = { ...baseDto, roleKey: 'developer' } as unknown as CreateUserDto;

        const res = await service.createTenantUser(dto);

        expect(res.statusCode).toBe(201);
        expect(repoCreate).toHaveBeenCalledTimes(1);
    });

    // Issue #27: el endpoint global POST /users (create) es administrativo de
    // plataforma. Comparte el permiso `users.create` con el endpoint scoped
    // /users/my-tenant, así que un merchant (tenant-bound, con users.create)
    // podía alcanzarlo y crear un usuario con roleKey arbitrario (escalada) o en
    // otro tenant. El create() global debe rechazar a actores tenant-bound.
    it('#27: create() global RECHAZA (403) a un actor tenant-bound y NO crea', async () => {
        // getTenantId por defecto = 'tenant-1' (actor ligado a tenant, p.ej. merchant)
        const escalation = { ...baseDto, roleKey: 'admin' } as unknown as CreateUserDto;

        const res = await service.create(escalation);

        expect(res.statusCode).toBe(403);
        expect(repoCreate).not.toHaveBeenCalled();
    });

    it('#27: create() global permite a un actor de plataforma (sin tenant)', async () => {
        getTenantId.mockReturnValue(undefined);

        const res = await service.create(baseDto);

        expect(res.statusCode).toBe(201);
        expect(repoCreate).toHaveBeenCalledTimes(1);
    });

    it('listTenantUsers filtra por el tenantId del contexto', async () => {
        await service.listTenantUsers({} as any);

        expect(repoFindAll).toHaveBeenCalledTimes(1);
        expect(repoFindAll.mock.calls[0][0]).toMatchObject({ tenantId: 'tenant-1' });
    });

    it('listTenantUsers falla-cerrado (403) y NO consulta si no hay tenant', async () => {
        getTenantId.mockReturnValue(undefined);

        const res = await service.listTenantUsers({} as any);

        expect(res.statusCode).toBe(403);
        expect(repoFindAll).not.toHaveBeenCalled();
    });
});
