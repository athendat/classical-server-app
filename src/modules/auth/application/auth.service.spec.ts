import { HttpStatus } from '@nestjs/common';

import { captureLogs, findLeakedSecrets, LogCapture } from 'src/common/testing/log-capture';
import { Result } from 'src/common/types/result.type';
import { AuthService } from './auth.service';

describe('AuthService.login', () => {
  const ID_NUMBER = '85010112345';
  let logs: LogCapture;

  afterEach(() => {
    logs?.restore();
  });

  it("a successful login does not write the Customer's idNumber to the logs", async () => {
    const user = { id: 'user-1', phone: '5355555555', idNumber: ID_NUMBER, roleKey: 'user' };
    const usersService = {
      findByPhone: jest.fn().mockResolvedValue({ ok: true, data: user }),
      findByIdRaw: jest.fn().mockResolvedValue({ phoneConfirmed: true, passwordHash: 'hash' }),
      verifyPassword: jest.fn().mockResolvedValue(true),
    };
    const auditService = { logAllow: jest.fn(), logDeny: jest.fn(), logError: jest.fn() };
    const service = new AuthService(
      { sign: jest.fn().mockResolvedValue(Result.ok('signed-jwt')) } as any, // jwtTokenPort
      { getRequestId: () => 'req-1' } as any, // asyncContext
      auditService as any,
      { listCardsForUser: jest.fn().mockResolvedValue({ data: [] }) } as any, // cardsService
      { get: jest.fn() } as any, // configService
      {} as any, // confirmationCodeService
      { emit: jest.fn() } as any, // eventEmitter
      {} as any, // permissionsService
      { saveSession: jest.fn() } as any, // sessionService
      { createSession: jest.fn() } as any, // sessionPersistenceService
      usersService as any,
      { findByUserId: jest.fn().mockResolvedValue(null) } as any, // tenantsRepository
      {} as any, // tenantVaultService
    );
    logs = captureLogs();

    const response = await service.login({ username: '5355555555', password: 'secret-password' } as any);

    expect(response.statusCode).toBe(HttpStatus.OK);
    const logText = logs.text(auditService.logAllow.mock.calls, auditService.logError.mock.calls);
    expect(findLeakedSecrets(logText, { idNumber: ID_NUMBER })).toEqual([]);
  });
});
