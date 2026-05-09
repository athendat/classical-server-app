import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SessionRepository } from './session.repository';
import { Session } from '../schemas/session.schema';
import { SessionStatus, ISession } from '../../domain/models/session.model';
import { UserDTO } from 'src/modules/users/domain/ports/users.port';

// TODO: tests obsoletos por refactor del repositorio de sesiones. Reescribir cuando se aborde sesiones.
describe.skip('SessionRepository', () => {
  let repository: SessionRepository;
  let mockSessionModel: any;

  const mockUserDTO: UserDTO = {
    id: 'user-123',
    fullname: 'John Doe',
    idNumber: '12345678',
    phone: '+50670000000',
    roleKey: 'user',
    additionalRoleKeys: [],
    status: 'ACTIVE' as any,
  };

  const mockSession: ISession = {
    id: 'session-123',
    userId: 'user-123',
    user: mockUserDTO,
    status: SessionStatus.ACTIVE,
    loginTimestamp: new Date('2026-02-12T10:00:00Z'),
    lastActivityTime: new Date('2026-02-12T10:00:00Z'),
    tokenUpdates: [],
    expiresAt: new Date('2026-02-19T10:00:00Z'),
    createdAt: new Date('2026-02-12T10:00:00Z'),
    updatedAt: new Date('2026-02-12T10:00:00Z'),
  };

  beforeEach(async () => {
    mockSessionModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionRepository,
        {
          provide: getModelToken(Session.name),
          useValue: mockSessionModel,
        },
      ],
    }).compile();

    repository = module.get<SessionRepository>(SessionRepository);
  });

  describe('create', () => {
    it('should create a new session', async () => {
      mockSessionModel.create.mockResolvedValue({
        ...mockSession,
        toObject: () => mockSession,
      });

      const result = await repository.create({
        userId: 'user-123',
        user: mockUserDTO,
        loginTimestamp: new Date('2026-02-12T10:00:00Z'),
        expiresAt: new Date('2026-02-19T10:00:00Z'),
      } as any);

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockSession);
      expect(mockSessionModel.create).toHaveBeenCalled();
    });

    it('should return error if create fails', async () => {
      const error = new Error('Database error');
      mockSessionModel.create.mockRejectedValue(error);

      const result = await repository.create({
        userId: 'user-123',
        user: mockUserDTO,
      } as any);

      expect(result.isSuccess).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('findByUserId', () => {
    it('should find active session by userId', async () => {
      const mockFind = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockSession,
          toObject: () => mockSession,
        }),
      });

      mockSessionModel.findOne.mockReturnValue(mockFind());

      const result = await repository.findByUserId('user-123');

      expect(result.isSuccess).toBe(true);
      expect(result.data).toEqual(mockSession);
    });

    it('should return undefined if no session found', async () => {
      const mockFind = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      mockSessionModel.findOne.mockReturnValue(mockFind());

      const result = await repository.findByUserId('user-123');

      expect(result.isSuccess).toBe(true);
      expect(result.data).toBeUndefined();
    });
  });

  describe('updateTokenHistory', () => {
    it('should add token update to history', async () => {
      const updatedSession = {
        ...mockSession,
        tokenUpdates: [{ timestamp: new Date(), tokenPreview: 'abcde...vwxyz' }],
        toObject: () => ({
          ...mockSession,
          tokenUpdates: [{ timestamp: new Date(), tokenPreview: 'abcde...vwxyz' }],
        }),
      };

      mockSessionModel.findOneAndUpdate.mockResolvedValue(updatedSession);

      const result = await repository.updateTokenHistory('user-123', 'abcde...vwxyz');

      expect(result.isSuccess).toBe(true);
      expect(result.data?.tokenUpdates).toHaveLength(1);
      expect(result.data?.tokenUpdates[0].tokenPreview).toBe('abcde...vwxyz');
    });

    it('should return error if session not found', async () => {
      mockSessionModel.findOneAndUpdate.mockResolvedValue(null);

      const result = await repository.updateTokenHistory('user-123', 'token-preview');

      expect(result.isSuccess).toBe(false);
      expect(result.error).toContain('No active session found');
    });
  });

  describe('updateStatus', () => {
    it('should update session status to EXPIRED', async () => {
      const expiredSession = {
        ...mockSession,
        status: SessionStatus.EXPIRED,
        toObject: () => ({ ...mockSession, status: SessionStatus.EXPIRED }),
      };

      mockSessionModel.findOneAndUpdate.mockResolvedValue(expiredSession);

      const result = await repository.updateStatus('user-123', SessionStatus.EXPIRED);

      expect(result.isSuccess).toBe(true);
      expect(result.data?.status).toBe(SessionStatus.EXPIRED);
    });

    it('should update session status to REVOKED', async () => {
      const revokedSession = {
        ...mockSession,
        status: SessionStatus.REVOKED,
        toObject: () => ({ ...mockSession, status: SessionStatus.REVOKED }),
      };

      mockSessionModel.findOneAndUpdate.mockResolvedValue(revokedSession);

      const result = await repository.updateStatus('user-123', SessionStatus.REVOKED);

      expect(result.isSuccess).toBe(true);
      expect(result.data?.status).toBe(SessionStatus.REVOKED);
    });
  });

  describe('findExpiredSessions', () => {
    it('should find expired sessions', async () => {
      const expiredSession = {
        ...mockSession,
        expiresAt: new Date('2026-02-01T00:00:00Z'), // In the past
        toObject: () => ({ ...mockSession, expiresAt: new Date('2026-02-01T00:00:00Z') }),
      };

      mockSessionModel.find.mockResolvedValue([expiredSession]);

      const result = await repository.findExpiredSessions();

      expect(result.isSuccess).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].expiresAt).toEqual(new Date('2026-02-01T00:00:00Z'));
    });

    it('should return empty array if no expired sessions', async () => {
      mockSessionModel.find.mockResolvedValue([]);

      const result = await repository.findExpiredSessions();

      expect(result.isSuccess).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });

  describe('updateLastActivity', () => {
    it('should update last activity timestamp', async () => {
      const updatedSession = {
        ...mockSession,
        lastActivityTime: new Date(),
        toObject: () => ({ ...mockSession, lastActivityTime: new Date() }),
      };

      mockSessionModel.findOneAndUpdate.mockResolvedValue(updatedSession);

      const result = await repository.updateLastActivity('user-123');

      expect(result.isSuccess).toBe(true);
      expect(result.data?.lastActivityTime).toBeDefined();
    });
  });
});
