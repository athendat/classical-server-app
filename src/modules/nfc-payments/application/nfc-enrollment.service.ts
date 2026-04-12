/**
 * Application Service: NfcEnrollmentService
 *
 * Flujo principal de enrollment de tarjetas NFC.
 * Orquesta la generación de claves ECDH, derivación HKDF y almacenamiento en Vault.
 */

import { Injectable, Inject, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import * as crypto from 'crypto';

import { NFC_ENROLLMENT_INJECTION_TOKENS, NFC_PAYMENT_INJECTION_TOKENS } from '../domain/constants/nfc-payment.constants';
import type { INfcEnrollmentRepository, NfcEnrollmentEntity } from '../domain/ports/nfc-enrollment-repository.port';
import type { IHkdfKeyDerivationPort } from '../domain/ports/hkdf-key-derivation.port';
import { EcdhCryptoAdapter } from '../../devices/infrastructure/adapters/ecdh-crypto.adapter';
import { VaultHttpAdapter } from '../../vault/infrastructure/adapters/vault-http.adapter';
import { NfcEnrollmentResponseDto } from '../dto/nfc-enrollment-response.dto';

@Injectable()
export class NfcEnrollmentService {
  private readonly logger = new Logger(NfcEnrollmentService.name);

  constructor(
    @Inject(NFC_ENROLLMENT_INJECTION_TOKENS.NFC_ENROLLMENT_REPOSITORY)
    private readonly enrollmentRepository: INfcEnrollmentRepository,
    @Inject(NFC_PAYMENT_INJECTION_TOKENS.HKDF_KEY_DERIVATION_PORT)
    private readonly hkdfService: IHkdfKeyDerivationPort,
    private readonly ecdhCrypto: EcdhCryptoAdapter,
    private readonly vaultClient: VaultHttpAdapter,
    @InjectRedis() private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {}

  async enrollCard(userId: string, cardId: string, devicePublicKey: string): Promise<NfcEnrollmentResponseDto> {
    // 1. Validate device public key (65 bytes, starts with 0x04)
    const keyBuffer = Buffer.from(devicePublicKey, 'base64');
    if (keyBuffer.length !== 65 || keyBuffer[0] !== 0x04) {
      throw new BadRequestException('Invalid device public key: must be 65-byte uncompressed P-256 key');
    }

    // 2. Check if card already enrolled -- if so, revoke old enrollment
    const existingEnrollment = await this.enrollmentRepository.findByCardId(cardId);
    if (existingEnrollment) {
      this.logger.log(`Card ${cardId} already enrolled, revoking old enrollment`);
      await this.vaultClient.deleteKV(existingEnrollment.vaultKeyPath);
      await this.enrollmentRepository.update(cardId, {
        status: 'revoked',
        revokedAt: new Date(),
      });
      await this.resetRedisCounter(cardId);
    }

    // 3. Generate server ECDH P-256 key pair
    const serverKeyPair = await this.ecdhCrypto.generateKeyPair();

    // 4. Derive shared secret
    const sharedSecret = await this.ecdhCrypto.deriveSharedSecret(
      devicePublicKey,
      serverKeyPair.privateKeyPem,
    );

    // 5. Derive root seed (empty salt — must match device-side HkdfKeyDerivation.deriveRootSeed)
    const rootSeed = this.hkdfService.deriveRootSeed(sharedSecret, Buffer.alloc(0));

    // 7. Store root seed in Vault
    const vaultKeyPath = `nfc-enrollments/${cardId}/root-seed`;
    const vaultWriteResult = await this.vaultClient.writeKV(vaultKeyPath, {
      rootSeed: rootSeed.toString('base64'),
      createdAt: new Date().toISOString(),
    });

    // Fail fast if Vault write failed or returned an unexpected result
    if (!vaultWriteResult) {
      this.logger.error(`Failed to store root seed in Vault for card ${cardId}: empty or undefined response`);
      throw new ForbiddenException('Failed to securely store NFC enrollment data');
    }
    if ((vaultWriteResult as any).success === false) {
      this.logger.error(
        `Failed to store root seed in Vault for card ${cardId}: ${(vaultWriteResult as any).error ?? 'unknown error'}`,
      );
      throw new ForbiddenException('Failed to securely store NFC enrollment data');
    }
    // 8. Create enrollment record in MongoDB
    await this.enrollmentRepository.create({
      cardId,
      userId,
      devicePublicKey,
      serverPublicKey: serverKeyPair.publicKeyBase64,
      vaultKeyPath,
      counter: 0,
      status: 'active',
    });

    // 9. Return server public key + counter = 0
    return {
      serverPublicKey: serverKeyPair.publicKeyBase64,
      counter: 0,
    };
  }

  async getEnrollment(cardId: string): Promise<NfcEnrollmentEntity | null> {
    return this.enrollmentRepository.findByCardId(cardId);
  }

  async revokeEnrollment(cardId: string, userId: string): Promise<void> {
    // 1. Find enrollment, verify userId matches
    const enrollment = await this.enrollmentRepository.findByCardId(cardId);
    if (!enrollment) {
      throw new BadRequestException(`No enrollment found for card ${cardId}`);
    }
    if (enrollment.userId !== userId) {
      throw new ForbiddenException('Cannot revoke enrollment belonging to another user');
    }

    // 2. Delete root seed from Vault
    await this.vaultClient.deleteKV(enrollment.vaultKeyPath);

    // 3. Update enrollment: status = 'revoked', revokedAt = now
    await this.enrollmentRepository.update(cardId, {
      status: 'revoked',
      revokedAt: new Date(),
    });

    // 4. Reset counter in Redis
    await this.resetRedisCounter(cardId);
  }

  private async resetRedisCounter(cardId: string): Promise<void> {
    const rootKey = this.configService.get<string>('REDIS_ROOT_KEY') || '';
    const counterKey = rootKey
      ? `${rootKey}:nfc:enrollment:counter:${cardId}`
      : `nfc:enrollment:counter:${cardId}`;
    await this.redis.del(counterKey);
    this.logger.log(`Redis counter reset for card ${cardId}`);
  }

  async getCounterAndIncrement(cardId: string): Promise<number> {
    return this.enrollmentRepository.incrementCounter(cardId);
  }
}
