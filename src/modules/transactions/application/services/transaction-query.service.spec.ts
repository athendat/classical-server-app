import { Test, TestingModule } from '@nestjs/testing';

import { TransactionQueryService } from './transaction-query.service';
import { TransactionsRepository } from '../../infrastructure/adapters/transactions.repository';
import { AsyncContextService } from 'src/common/context';
import { AuditService } from 'src/modules/audit/application/audit.service';

/**
 * Issue #28 (review PR #45): el servicio debe MERGEAR el rango de fechas
 * (createdAt) en el filtro Mongo que pasa al repositorio, componiéndolo con los
 * demás filtros (e.g. status). Un test a nivel servicio evita regresiones si el
 * spread del fragmento de fecha se cae.
 */
describe('TransactionQueryService.list — date range merge', () => {
    let service: TransactionQueryService;
    let findAll: jest.Mock;

    beforeEach(async () => {
        findAll = jest.fn().mockResolvedValue({ data: [], total: 0, meta: {} });

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TransactionQueryService,
                { provide: TransactionsRepository, useValue: { findAll } },
                {
                    provide: AsyncContextService,
                    useValue: {
                        getRequestId: jest.fn().mockReturnValue('req'),
                        getActorId: jest.fn().mockReturnValue('actor-1'),
                        getActor: jest.fn().mockReturnValue({ actorId: 'actor-1', actorType: 'user' }),
                    },
                },
                { provide: AuditService, useValue: { logAllow: jest.fn(), logError: jest.fn() } },
            ],
        }).compile();

        service = module.get(TransactionQueryService);
    });

    it('mezcla createdAt {$gte,$lte} y lo compone con el filtro de status', async () => {
        await service.list(
            { page: 1, limit: 5, filters: { status: 'success' } } as any,
            undefined,
            { from: '2026-05-03T00:00:00.000Z', to: '2026-06-02T23:59:59.999Z' },
        );

        expect(findAll).toHaveBeenCalledTimes(1);
        const filterArg = findAll.mock.calls[0][0];
        expect(filterArg.createdAt?.$gte).toBeInstanceOf(Date);
        expect(filterArg.createdAt?.$lte).toBeInstanceOf(Date);
        expect(filterArg.status).toBe('success');
    });

    it('no agrega createdAt cuando no hay rango', async () => {
        await service.list({ page: 1, limit: 5, filters: {} } as any, undefined, {});

        const filterArg = findAll.mock.calls[0][0];
        expect(filterArg.createdAt).toBeUndefined();
    });
});
