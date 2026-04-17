/**
 * Module: NfcPaymentsModule
 *
 * Módulo de pagos NFC con derivación de claves HKDF, firma ECDSA y codec TLV.
 * Arquitectura hexagonal con separación clara entre domain, application e infrastructure.
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  NFC_PAYMENT_INJECTION_TOKENS,
  NFC_ENROLLMENT_INJECTION_TOKENS,
} from './domain/constants/nfc-payment.constants';
import { TlvCodecAdapter } from './infrastructure/adapters/tlv-codec.adapter';
import { HkdfKeyDerivationAdapter } from './infrastructure/adapters/hkdf-key-derivation.adapter';
import { EcdsaSignatureAdapter } from './infrastructure/adapters/ecdsa-signature.adapter';

// Enrollment
import { NfcEnrollmentService } from './application/nfc-enrollment.service';
import { NfcEnrollmentRepository } from './infrastructure/repositories/nfc-enrollment.repository';
import { NfcEnrollmentController } from './infrastructure/controllers/nfc-enrollment.controller';
import {
  NfcEnrollment,
  NfcEnrollmentSchema,
} from './infrastructure/schemas/nfc-enrollment.schema';

// Prepare (Slice 5)
import { NfcPrepareService } from './application/nfc-prepare.service';
import { NfcPrepareController } from './infrastructure/controllers/nfc-prepare.controller';

// Authorization (Slice 8)
import { NfcAuthorizationService } from './application/nfc-authorization.service';
import { NfcAuthorizationController } from './infrastructure/controllers/nfc-authorization.controller';
import { NfcTransactionBuilder } from './application/nfc-transaction.builder';

// Reused adapters from other modules
import { EcdhCryptoAdapter } from '../devices/infrastructure/adapters/ecdh-crypto.adapter';
import { VaultModule } from '../vault/vault.module';
import { AuthModule } from '../auth/auth.module';
import { CachingModule } from 'src/common/cache/cache.module';
import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import { VaultHttpAdapter } from '../vault/infrastructure/adapters/vault-http.adapter';
import { TerminalsModule } from '../terminals/terminals.module';
import { SocketsModule } from 'src/sockets/sockets.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NfcEnrollment.name, schema: NfcEnrollmentSchema },
    ]),
    VaultModule,
    AuthModule,
    CachingModule,
    TerminalsModule,
    SocketsModule,
    TransactionsModule,
  ],
  controllers: [NfcEnrollmentController, NfcPrepareController, NfcAuthorizationController],
  providers: [
    // Slice 1 adapters
    {
      provide: NFC_PAYMENT_INJECTION_TOKENS.TLV_CODEC_PORT,
      useClass: TlvCodecAdapter,
    },
    {
      provide: NFC_PAYMENT_INJECTION_TOKENS.HKDF_KEY_DERIVATION_PORT,
      useClass: HkdfKeyDerivationAdapter,
    },
    {
      provide: NFC_PAYMENT_INJECTION_TOKENS.ECDSA_SIGNATURE_PORT,
      useClass: EcdsaSignatureAdapter,
    },
    // Slice 2: Enrollment
    {
      provide: NFC_ENROLLMENT_INJECTION_TOKENS.NFC_ENROLLMENT_REPOSITORY,
      useClass: NfcEnrollmentRepository,
    },
    EcdhCryptoAdapter,
    {
      provide: VaultHttpAdapter,
      useExisting: INJECTION_TOKENS.VAULT_CLIENT,
    },
    NfcEnrollmentService,
    // Slice 5: Prepare
    NfcPrepareService,
    // Slice 8: Authorization
    NfcAuthorizationService,
    NfcTransactionBuilder,
  ],
  exports: [
    NFC_PAYMENT_INJECTION_TOKENS.TLV_CODEC_PORT,
    NFC_PAYMENT_INJECTION_TOKENS.HKDF_KEY_DERIVATION_PORT,
    NFC_PAYMENT_INJECTION_TOKENS.ECDSA_SIGNATURE_PORT,
    NfcEnrollmentService,
    NfcPrepareService,
    NfcAuthorizationService,
  ],
})
export class NfcPaymentsModule {}
