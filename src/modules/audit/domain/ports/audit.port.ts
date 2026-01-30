import { Result } from 'src/common/types/result.type';

/**
 * Audit log entry.
 */
export interface AuditLogEntry {
  id: string;
  timestamp: number;
  actor: {
    id: string;
    type: 'user' | 'service';
  };
  operation: string;
  resource: {
    type: string;
    id: string;
  };
  status: 'success' | 'failure';
  changes?: {
    before?: any;
    after?: any;
  };
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Audit error.
 */
export interface AuditError extends Error {
  code: string;
  statusCode: number;
}

/**
 * Domain port for audit service.
 * Handles audit logging and retrieval.
 */
export interface IAuditService {
  /**
   * Log an audit event.
   *
   * @param entry Audit log entry to record
   * @returns Result with entry ID or error
   */
  log(entry: AuditLogEntry): Promise<Result<string>>;

  /**
   * Retrieve audit log entries.
   *
   * @param actorId Filter by actor ID (optional)
   * @param operationType Filter by operation type (optional)
   * @param limit Pagination limit
   * @param offset Pagination offset
   * @returns Result with list of entries or error
   */
  query(
    actorId?: string,
    operationType?: string,
    limit?: number,
    offset?: number,
  ): Promise<Result<{ entries: AuditLogEntry[]; total: number }>>;

  /**
   * Get audit entry by ID.
   *
   * @param entryId Entry ID
   * @returns Result with entry or error
   */
  getEntry(entryId: string): Promise<Result<AuditLogEntry>>;

  /**
   * Archive old audit entries (move to cold storage).
   * Useful for retention policies.
   *
   * @param beforeDate Timestamp threshold
   * @returns Result with count of archived entries or error
   */
  archive(beforeDate: number): Promise<Result<number>>;
}
