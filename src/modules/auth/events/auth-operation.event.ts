import { BaseDomainEvent } from 'src/common/events/base-domain.event';

/**
 * Event emitted when authentication operation completes or fails.
 */
export class AuthOperationEvent extends BaseDomainEvent {
  constructor(
    public readonly operation: 'sign' | 'verify' | 'rotate' | 'check-replay',
    public readonly status: 'completed' | 'failed',
    public readonly duration: number,
    public readonly subject?: string,
    public readonly kid?: string,
    public readonly error?: Error,
    requestId?: string,
  ) {
    super(requestId);
  }
}
