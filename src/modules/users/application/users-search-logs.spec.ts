import { HttpStatus } from '@nestjs/common';

import { captureLogs, findLeakedSecrets } from 'src/common/testing/log-capture';
import { UsersRepository } from '../infrastructure/adapters/users.repository';
import { UsersService } from './users.service';

/** Fake Mongoose model: every query resolves empty */
function emptyUserModel() {
  const query: Record<string, jest.Mock> = {};
  for (const step of ['sort', 'skip', 'populate', 'limit', 'lean']) {
    query[step] = jest.fn(() => query);
  }
  query.exec = jest.fn().mockResolvedValue([]);
  return {
    find: jest.fn(() => query),
    countDocuments: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(0) })),
    distinct: jest.fn(() => ({ exec: jest.fn().mockResolvedValue([]) })),
  };
}

describe('User search by idNumber', () => {
  const ID_NUMBER = '85010112345';

  it("does not write the searched Customer's idNumber to the logs", async () => {
    const userModel = emptyUserModel();
    const service = new UsersService(
      { emit: jest.fn() } as any, // eventEmitter
      new UsersRepository(userModel as any),
      {} as any, // userLifecycleRepository
      { getRequestId: () => 'req-1', getActorId: () => 'admin-1' } as any,
      { logAllow: jest.fn(), logError: jest.fn() } as any,
    );
    const logs = captureLogs();

    try {
      const response = await service.list({ page: 1, limit: 10, search: ID_NUMBER });

      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(userModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: expect.arrayContaining([{ idNumber: { $regex: ID_NUMBER, $options: 'i' } }]),
        }),
      );
      expect(findLeakedSecrets(logs.text(), { idNumber: ID_NUMBER })).toEqual([]);
    } finally {
      logs.restore();
    }
  });
});
