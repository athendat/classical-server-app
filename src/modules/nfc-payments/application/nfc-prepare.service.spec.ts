/**
 * Unit Tests: NfcPrepareService
 *
 * Tests for NFC payment session preparation flow:
 * - Session creation with nonce, counter, timestamp, sessionId
 * - Enrollment validation (active, ownership)
 * - Redis session storage and invalidation
 * - Session retrieval and marking as used
 */

import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';

import { NfcPrepareService } from './nfc-prepare.service';
import { NfcEnrollmentService } from './nfc-enrollment.service';
import { CacheService } from 'src/common/cache/cache.service';
import type { NfcEnrollmentEntity } from '../domain/ports/nfc-enrollment-repository.port';

describe('NfcPrepareService (Unit Tests)', () => {
  let service: NfcPrepareService;
  let mockEnrollmentService: Partial<jest.Mocked<NfcEnrollmentService>>;
  let mockCacheService: Partial<jest.Mocked<CacheService>>;

  const activeEnrollment: NfcEnrollmentEntity = {
    id: 'enrollment-id',
    cardId: 'card-1',
    userId: 'user-1',
    devicePublicKey: 'some-key',
    serverPublicKey: 'some-server-key',
    vaultKeyPath: 'nfc-enrollments/card-1/root-seed',
    counter: 5,
    status: 'active',
  };

  beforeEach(async () => {
    mockEnrollmentService = {
      getEnrollment: jest.fn().mockResolvedValue(activeEnrollment),
    };

    mockCacheService = {
      getByKey: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NfcPrepareService,
        {
          provide: NfcEnrollmentService,
          useValue: mockEnrollmentService,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    service = module.get<NfcPrepareService>(NfcPrepareService);
  });

  describe('preparePaymentSession', () => {
    it('should return nonce, counter, serverTimestamp, and sessionId for enrolled card', async () => {
      const result = await service.preparePaymentSession('user-1', 'card-1');

      // nonce is 32-char hex string
      expect(result.nonce).toMatch(/^[0-9a-f]{32}$/);
      // counter matches enrollment
      expect(result.counter).toBe(5);
      // serverTimestamp is close to now
      expect(result.serverTimestamp).toBeGreaterThan(Date.now() - 5000);
      expect(result.serverTimestamp).toBeLessThanOrEqual(Date.now());
      // sessionId is UUID format
      expect(result.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('should throw NOT_FOUND if card is not enrolled', async () => {
      mockEnrollmentService.getEnrollment!.mockResolvedValueOnce(null);

      await expect(
        service.preparePaymentSession('user-1', 'card-1'),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.NOT_FOUND,
        }),
      );
    });

    it('should throw NOT_FOUND if enrollment is revoked', async () => {
      mockEnrollmentService.getEnrollment!.mockResolvedValueOnce({
        ...activeEnrollment,
        status: 'revoked',
      });

      await expect(
        service.preparePaymentSession('user-1', 'card-1'),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.NOT_FOUND,
        }),
      );
    });

    it('should throw FORBIDDEN if userId does not match', async () => {
      mockEnrollmentService.getEnrollment!.mockResolvedValueOnce({
        ...activeEnrollment,
        userId: 'other-user',
      });

      await expect(
        service.preparePaymentSession('user-1', 'card-1'),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
        }),
      );
    });

    it('should store session in Redis with TTL 300', async () => {
      const result = await service.preparePaymentSession('user-1', 'card-1');

      expect(mockCacheService.set).toHaveBeenCalledWith(
        `nfc:session:${result.sessionId}`,
        expect.objectContaining({
          cardId: 'card-1',
          userId: 'user-1',
          nonce: result.nonce,
          counter: 5,
          sessionId: result.sessionId,
          used: false,
        }),
        300,
      );
    });

    it('should invalidate existing session for same card', async () => {
      mockCacheService.getByKey!.mockResolvedValueOnce('old-session-id');

      await service.preparePaymentSession('user-1', 'card-1');

      expect(mockCacheService.delete).toHaveBeenCalledWith('nfc:session:old-session-id');
      expect(mockCacheService.delete).toHaveBeenCalledWith('nfc:session:card:card-1');
    });
  });

  describe('getSession', () => {
    it('should return session data from Redis', async () => {
      const sessionData = {
        cardId: 'card-1',
        userId: 'user-1',
        nonce: 'abc123',
        counter: 5,
        serverTimestamp: Date.now(),
        sessionId: 'session-uuid',
        used: false,
      };

      mockCacheService.getByKey!.mockResolvedValueOnce(sessionData);

      const result = await service.getSession('session-uuid');

      expect(result).toEqual(sessionData);
      expect(mockCacheService.getByKey).toHaveBeenCalledWith('nfc:session:session-uuid');
    });
  });

  describe('markSessionUsed', () => {
    it('should update session with used=true and short TTL', async () => {
      const sessionData = {
        cardId: 'card-1',
        userId: 'user-1',
        nonce: 'abc123',
        counter: 5,
        serverTimestamp: Date.now(),
        sessionId: 'session-uuid',
        used: false,
      };

      mockCacheService.getByKey!.mockResolvedValueOnce(sessionData);

      await service.markSessionUsed('session-uuid');

      expect(mockCacheService.set).toHaveBeenCalledWith(
        'nfc:session:session-uuid',
        expect.objectContaining({
          ...sessionData,
          used: true,
        }),
        65,
      );
    });
  });
});
