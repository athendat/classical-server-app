import { Global, Module } from '@nestjs/common';
import { VaultHttpAdapter } from './infrastructure/adapters/vault-http.adapter';
import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';
import { AsyncContextService } from 'src/common/context/async-context.service';

/**
 * Global Vault module providing centralized Vault client access.
 * Exposes VAULT_CLIENT token for dependency injection across all modules.
 * Handles AppRole authentication, KV v2 operations, and token lifecycle.
 */
@Global()
@Module({
  providers: [
    AsyncContextService,
    {
      provide: INJECTION_TOKENS.VAULT_CLIENT,
      useClass: VaultHttpAdapter,
    },
  ],
  exports: [INJECTION_TOKENS.VAULT_CLIENT],
})
export class VaultModule {}
