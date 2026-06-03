import { HttpStatus } from '@nestjs/common';

import { TenantsService } from './tenant.service';
import { Result } from '../../../common/types/result.type';

/**
 * Issue #46 — `GET /tenants/my-tenant` (getTenantByUser) devolvía 500
 * ("Error al obtener tenant" / "Cannot get value from failed result") cuando el
 * enriquecimiento con el PAN del Vault fallaba: el código llamaba
 * `panResult.getValue()` sin verificar `isSuccess`, y getValue() lanza sobre un
 * Result fallido. El PAN es un dato SUPLEMENTARIO — un fallo transitorio del
 * Vault no debe tumbar la obtención del tenant. (Downstream: ese 500 hacía que
 * el guard del admin botara al merchant a "Acceso Denegado" — admin #33.)
 */
describe('TenantsService.getTenantByUser', () => {
    const tenantFixture = {
        id: 'tenant-1',
        code: '00000001',
        businessName: 'ATHENDAT',
        businessAddress: { address: 'Calle 23', city: 'La Habana', state: '', zipCode: '', country: 'CU' },
        email: 'a@b.com',
        status: 'active',
        userId: 'user-1',
    };

    function buildService(getPanResult: Result<string>) {
        const asyncContextService = {
            getRequestId: () => 'req-1',
            getActorId: () => 'user-1',
            getActor: () => ({ id: 'user-1', roleKey: 'user' }),
        };
        const auditService = {
            logAllow: jest.fn(),
            logDeny: jest.fn(),
            logError: jest.fn(),
        };
        const vaultService = {
            getPan: jest.fn().mockResolvedValue(getPanResult),
            maskPan: jest.fn((pan: string) => `**** ${pan.slice(-4)}`),
        };
        const tenantsRepository = {
            findByUserId: jest.fn().mockResolvedValue(tenantFixture),
        };

        const service = new TenantsService(
            asyncContextService as any,
            auditService as any,
            {} as any, // eventEmitter
            {} as any, // lifecycleRepository
            {} as any, // oauth2CredentialsService
            {} as any, // tenantSequenceAdapter
            tenantsRepository as any,
            vaultService as any,
            {} as any, // webhooksService
            {} as any, // usersRepository
        );
        return { service, vaultService };
    }

    it('devuelve 200 con el tenant aunque el PAN del Vault falle (no 500)', async () => {
        const { service } = buildService(Result.fail<string>(new Error('Vault sealed')));

        const res = await service.getTenantByUser();

        expect(res.ok).toBe(true);
        expect(res.statusCode).toBe(HttpStatus.OK);
        expect(res.data?.id).toBe('tenant-1');
        // El PAN es suplementario: queda enmascarado/indefinido, no rompe la respuesta.
        expect(res.data?.unmaskPan).toBeUndefined();
        expect(res.data?.maskedPan).toBe('**** **** **** ****');
    });

    it('devuelve 200 con el PAN cuando el Vault responde', async () => {
        const { service, vaultService } = buildService(Result.ok<string>('1234567812345678'));

        const res = await service.getTenantByUser();

        expect(res.ok).toBe(true);
        expect(res.statusCode).toBe(HttpStatus.OK);
        expect(res.data?.unmaskPan).toBe('1234567812345678');
        expect(res.data?.maskedPan).toBe('**** 5678');
        expect(vaultService.maskPan).toHaveBeenCalledWith('1234567812345678');
    });
});
