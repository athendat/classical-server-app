import { BaseDomainEvent } from 'src/common/events/base-domain.event';

/**
 * Event emitted when authorization operation completes or fails.
 */
export class AuthzOperationEvent extends BaseDomainEvent {
  constructor(
    public readonly operation: 'resolve' | 'check' | 'invalidate' | 'clear',
    public readonly status: 'completed' | 'failed',
    public readonly duration: number,
    public readonly actor?: string,
    public readonly error?: Error,
    requestId?: string,
  ) {
    super(requestId);
  }
}
