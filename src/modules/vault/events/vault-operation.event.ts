import { BaseDomainEvent } from 'src/common/events/base-domain.event';
import { VaultError } from '../domain/ports/vault-client.port';

/**
 * Vault operation completed event (success or failure)
 */
export class VaultOperationEvent extends BaseDomainEvent {
  constructor(
    public readonly operation:
      | 'login'
      | 'read'
      | 'write'
      | 'delete'
      | 'renew'
      | 'unwrap',
    public readonly path?: string,
    public readonly status: 'completed' | 'failed' = 'completed',
    public readonly error?: VaultError,
    requestId?: string,
  ) {
    super(requestId);
  }
}
