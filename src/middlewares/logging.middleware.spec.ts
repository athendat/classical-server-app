import { captureLogs, findLeakedSecrets } from 'src/common/testing/log-capture';
import { LoggingMiddleware } from './logging.middleware';

describe('LoggingMiddleware', () => {
  it("logs an incoming request without its query string, which can carry a Customer's idNumber", () => {
    const ID_NUMBER = '85010112345';
    const req = {
      method: 'GET',
      path: '/api_053/users',
      protocol: 'https',
      originalUrl: `/api_053/users?search=${ID_NUMBER}&page=2`,
      get: (header: string) => (header === 'host' ? 'api.test' : undefined),
    };
    const next = jest.fn();
    const logs = captureLogs();

    try {
      new LoggingMiddleware().use(req as any, {} as any, next);

      expect(next).toHaveBeenCalled();
      expect(logs.text()).toContain('/api_053/users');
      expect(findLeakedSecrets(logs.text(), { idNumber: ID_NUMBER })).toEqual([]);
    } finally {
      logs.restore();
    }
  });
});
