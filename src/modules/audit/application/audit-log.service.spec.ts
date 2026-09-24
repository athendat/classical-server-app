import { captureLogs, findLeakedSecrets } from 'src/common/testing/log-capture';
import { AuditLogService } from './audit-log.service';

describe('AuditLogService.findAll', () => {
  it('does not write the free-text search term to the logs', async () => {
    const ID_NUMBER = '85010112345';
    const query: Record<string, jest.Mock> = {};
    for (const step of ['sort', 'skip', 'limit', 'lean', 'select']) {
      query[step] = jest.fn(() => query);
    }
    query.exec = jest.fn().mockResolvedValue([]);
    const auditEventModel = {
      find: jest.fn(() => query),
      countDocuments: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(0) })),
    };
    const service = new AuditLogService(
      auditEventModel as any,
      { getRequestId: () => 'req-1', getActorId: () => 'admin-1' } as any,
    );
    const logs = captureLogs();

    try {
      await service.findAll({ page: 1, limit: 20, search: ID_NUMBER });

      expect(auditEventModel.find).toHaveBeenCalled();
      expect(findLeakedSecrets(logs.text(), { 'searched idNumber': ID_NUMBER })).toEqual([]);
    } finally {
      logs.restore();
    }
  });
});
