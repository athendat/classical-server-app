import { BaseDomainEvent } from 'src/common/events/base-domain.event';

/**
 * Event emitted when audit operation completes or fails.
 */
export class AuditOperationEvent extends BaseDomainEvent {
  constructor(
    public readonly operation: 'log' | 'query' | 'get-entry' | 'archive',
    public readonly status: 'completed' | 'failed',
    public readonly duration: number,
    public readonly entryId?: string,
    public readonly actorId?: string,
    public readonly resourceType?: string,
    public readonly error?: Error,
    requestId?: string,
  ) {
    super(requestId);
  }
}
