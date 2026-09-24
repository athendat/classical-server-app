import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';

import {
  findLeakedSecrets,
  serializeForLog,
} from 'src/common/testing/log-capture';
import { AuditInterceptor } from './audit.interceptor';

describe('AuditInterceptor', () => {
  const PAN = '4539578763621486';
  const PIN = '4719';
  const TML = '00012345';
  const AUT = '654321';
  const CARD_TOKEN = '0400000000701851';
  const ID_NUMBER = '85010112345';
  const TENANT_PAN = '9200123456780001';

  it('records a Card registration in the audit trail without the PAN, PIN, TML, AUT, Card token or idNumber', async () => {
    const asyncContext = {
      getRequestId: () => 'req-1',
      setHttpMetadata: jest.fn(),
    };
    const eventEmitter = { emit: jest.fn() };
    const interceptor = new AuditInterceptor(
      asyncContext as any,
      eventEmitter as any,
    );

    const req = {
      method: 'POST',
      path: '/cards',
      query: {},
      body: {
        pan: PAN,
        pin: PIN,
        tml: TML,
        aut: AUT,
        cardType: 'PERSONAL',
        beneficiaryAccount: TENANT_PAN,
      },
      get: () => undefined,
      headers: {},
      ip: '127.0.0.1',
      socket: {},
    };
    const res: any = { statusCode: 201, json: jest.fn() };
    const context = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext;
    const next: CallHandler = {
      handle: () => {
        res.json({
          ok: true,
          data: {
            id: 'card-1',
            maskedPan: '**** **** **** 1486',
            tml: TML,
            aut: AUT,
            token: CARD_TOKEN,
          },
          meta: { user: { id: 'user-1', idNumber: ID_NUMBER } },
        });
        return of(undefined);
      },
    };

    await lastValueFrom(interceptor.intercept(context, next));
    await new Promise((resolve) => setImmediate(resolve));

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'audit.response-captured',
      expect.anything(),
    );
    const auditText = serializeForLog([
      asyncContext.setHttpMetadata.mock.calls,
      eventEmitter.emit.mock.calls,
    ]);
    expect(auditText).toContain('PERSONAL');
    expect(
      findLeakedSecrets(auditText, {
        PAN,
        PIN,
        TML,
        AUT,
        'Card token': CARD_TOKEN,
        idNumber: ID_NUMBER,
        'Tenant PAN': TENANT_PAN,
      }),
    ).toEqual([]);
  });

  it("records an admin user search in the audit trail without the Customer's idNumber or PAN from the query string", async () => {
    const asyncContext = {
      getRequestId: () => 'req-2',
      setHttpMetadata: jest.fn(),
    };
    const interceptor = new AuditInterceptor(
      asyncContext as any,
      { emit: jest.fn() } as any,
    );
    const req = {
      method: 'GET',
      path: '/users',
      query: { search: ID_NUMBER, page: '2', pan: PAN },
      body: {},
      get: () => undefined,
      headers: {},
      ip: '127.0.0.1',
      socket: {},
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({ statusCode: 200, json: jest.fn() }),
      }),
    } as unknown as ExecutionContext;

    await lastValueFrom(
      interceptor.intercept(context, { handle: () => of(undefined) }),
    );

    const auditText = serializeForLog(asyncContext.setHttpMetadata.mock.calls);
    expect(auditText).toContain('page');
    expect(findLeakedSecrets(auditText, { idNumber: ID_NUMBER, PAN })).toEqual(
      [],
    );
  });
});
