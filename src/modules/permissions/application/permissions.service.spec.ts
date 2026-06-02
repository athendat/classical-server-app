import { Test, TestingModule } from '@nestjs/testing';

import { PermissionsService } from './permissions.service';
import { CacheService } from 'src/common/cache/cache.service';
import { RolesService } from '../../roles/application/roles.service';
import { UsersService } from '../../users/application/users.service';
import { Actor } from 'src/common/interfaces';

/**
 * Issue #21 / classical-server-app#42 — /modules/navigation devolvía
 * intermitentemente data:[]. Causa: cuando la resolución de permisos daba
 * vacío (p.ej. findActiveByKeys traga un error de Mongo y devuelve []), ese
 * resultado vacío se CACHEABA ~60s, envenenando toda la sesión.
 *
 * Fix: no cachear resoluciones de permisos vacías, para que la siguiente
 * petición recompute en lugar de servir un vacío pegado.
 */
describe('PermissionsService caching', () => {
    let service: PermissionsService;
    let cacheService: { getByKey: jest.Mock; set: jest.Mock };
    let rolesService: { findActiveByKeys: jest.Mock };
    let usersService: { findByIdRaw: jest.Mock };

    const actor: Actor = { actorType: 'user', actorId: 'u1' } as Actor;

    beforeEach(async () => {
        cacheService = { getByKey: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
        rolesService = { findActiveByKeys: jest.fn() };
        usersService = {
            findByIdRaw: jest.fn().mockResolvedValue({ roleKey: 'user', additionalRoleKeys: ['merchant'] }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PermissionsService,
                { provide: CacheService, useValue: cacheService },
                { provide: RolesService, useValue: rolesService },
                { provide: UsersService, useValue: usersService },
            ],
        }).compile();

        service = module.get(PermissionsService);
    });

    it('no cachea cuando los permisos resueltos están vacíos', async () => {
        // findActiveByKeys devuelve [] (p.ej. error de DB tragado) → permisos vacíos
        rolesService.findActiveByKeys.mockResolvedValue([]);

        const result = await service.resolvePermissions(actor);

        expect(result.exactPermissions.size).toBe(0);
        expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('cachea cuando los permisos resueltos NO están vacíos', async () => {
        rolesService.findActiveByKeys.mockResolvedValue([
            { permissionKeys: ['transactions.read', 'modules.*'] },
        ]);

        const result = await service.resolvePermissions(actor);

        expect(result.exactPermissions.has('transactions.read')).toBe(true);
        expect(cacheService.set).toHaveBeenCalledTimes(1);
    });

    it('devuelve el caché sin consultar la DB cuando existe', async () => {
        cacheService.getByKey.mockResolvedValue({
            permissions: {
                hasGlobalWildcard: false,
                moduleWildcards: [],
                exactPermissions: ['transactions.read'],
            },
        });

        const result = await service.resolvePermissions(actor);

        expect(result.exactPermissions.has('transactions.read')).toBe(true);
        expect(rolesService.findActiveByKeys).not.toHaveBeenCalled();
        expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('devuelve los permisos computados aunque cacheService.set falle (caché no debe denegar)', async () => {
        rolesService.findActiveByKeys.mockResolvedValue([
            { permissionKeys: ['users.view'] },
        ]);
        cacheService.set.mockRejectedValue(new Error('Redis write down'));

        const result = await service.resolvePermissions(actor);

        // Un fallo de ESCRITURA de caché no debe denegar: devolvemos lo computado.
        expect(result.exactPermissions.has('users.view')).toBe(true);
    });

    it('recomputa desde la DB cuando cacheService.getByKey falla (caché no debe denegar)', async () => {
        cacheService.getByKey.mockRejectedValue(new Error('Redis read down'));
        rolesService.findActiveByKeys.mockResolvedValue([
            { permissionKeys: ['users.view'] },
        ]);

        const result = await service.resolvePermissions(actor);

        expect(rolesService.findActiveByKeys).toHaveBeenCalled();
        expect(result.exactPermissions.has('users.view')).toBe(true);
    });

    it('cuando findActiveByKeys lanza, falla-cerrado (vacío) y NO cachea', async () => {
        // Escenario real del bug #42: un error transitorio de Mongo se propaga.
        rolesService.findActiveByKeys.mockRejectedValue(new Error('Mongo timeout'));

        const result = await service.resolvePermissions(actor);

        expect(result.hasGlobalWildcard).toBe(false);
        expect(result.moduleWildcards.size).toBe(0);
        expect(result.exactPermissions.size).toBe(0);
        expect(cacheService.set).not.toHaveBeenCalled();
    });
});
