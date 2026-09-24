import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { captureLogs, findLeakedSecrets, LogCapture } from 'src/common/testing/log-capture';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  let logs: LogCapture;

  beforeEach(() => {
    logs = captureLogs();
  });

  afterEach(() => {
    logs.restore();
  });

  it('stores a value without writing it to the logs, logging only its key and TTL', async () => {
    const redis = { set: jest.fn().mockResolvedValue('OK') };
    const configService = { get: jest.fn().mockReturnValue('app_') } as unknown as ConfigService;
    const cache = new CacheService(redis as unknown as Redis, configService);
    const session = { idNumber: '85010112345', refreshToken: 'refresh-token-value' };

    await cache.set('session:user-1', session, 300);

    expect(redis.set).toHaveBeenCalledWith('app_:session:user-1', JSON.stringify(session), 'PX', 300000);
    const logText = logs.text();
    expect(findLeakedSecrets(logText, { idNumber: session.idNumber, 'refresh token': session.refreshToken })).toEqual([]);
    expect(logText).toContain('app_:session:user-1');
    expect(logText).toContain('300');
  });
});
