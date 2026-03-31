/**
 * Application Service: NfcPrepareService
 *
 * Prepares NFC payment sessions for the mobile app.
 * Generates nonce, session ID, and stores session data in Redis.
 */

import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import * as crypto from 'crypto';

import { NfcEnrollmentService } from './nfc-enrollment.service';
import { CacheService } from 'src/common/cache/cache.service';

export interface SessionData {
  cardId: string;
  userId: string;
  nonce: string;
  counter: number;
  serverTimestamp: number;
  sessionId: string;
  used: boolean;
}

export interface PrepareResult {
  nonce: string;
  counter: number;
  serverTimestamp: number;
  sessionId: string;
}

@Injectable()
export class NfcPrepareService {
  constructor(
    private readonly enrollmentService: NfcEnrollmentService,
    private readonly cacheService: CacheService,
  ) {}

  async preparePaymentSession(userId: string, cardId: string): Promise<PrepareResult> {
    // 1. Get enrollment -- verify card is NFC-enrolled and active
    const enrollment = await this.enrollmentService.getEnrollment(cardId);
    if (!enrollment || enrollment.status !== 'active') {
      throw new HttpException('Card is not NFC-enrolled', HttpStatus.NOT_FOUND);
    }

    // 2. Verify userId matches enrollment
    if (enrollment.userId !== userId) {
      throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }

    // 3. Generate nonce (16 bytes, hex string = 32 chars)
    const nonce = crypto.randomBytes(16).toString('hex');

    // 4. Generate session ID (UUID)
    const sessionId = crypto.randomUUID();

    // 5. Get server timestamp
    const serverTimestamp = Date.now();

    // 6. Get current counter from enrollment
    const counter = enrollment.counter;

    // 7. Invalidate any existing session for this card
    const existingSessionId = await this.cacheService.getByKey<string>(`nfc:session:card:${cardId}`);
    if (existingSessionId) {
      await this.cacheService.delete(`nfc:session:${existingSessionId}`);
      await this.cacheService.delete(`nfc:session:card:${cardId}`);
    }

    // 8. Store session in Redis with TTL = 300 seconds (5 minutes)
    const sessionData: SessionData = {
      cardId,
      userId,
      nonce,
      counter,
      serverTimestamp,
      sessionId,
      used: false,
    };
    await this.cacheService.set(`nfc:session:${sessionId}`, sessionData, 300);

    // 9. Store card->session mapping (for invalidation on next prepare)
    await this.cacheService.set(`nfc:session:card:${cardId}`, sessionId, 300);

    // 10. Return session data to mobile app
    return {
      nonce,
      counter,
      serverTimestamp,
      sessionId,
    };
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    return this.cacheService.getByKey<SessionData>(`nfc:session:${sessionId}`);
  }

  async markSessionUsed(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      session.used = true;
      await this.cacheService.set(`nfc:session:${sessionId}`, session, 65);
    }
  }
}
