# Audit records are fire-and-forget events, with the HTTP response filled in later

Code audits explicitly by calling `AuditService.logAllow/logDeny/logError`. The call reads the actor and request id from the async context and emits an event, and a listener writes `audit_events`, so requests never wait on audit I/O. The global `AuditInterceptor` records the response afterwards and fills the status code into records with the same request id. Tenant and User lifecycle histories are separate and written synchronously.

## Consequences

- Audit writes can be lost silently, and the backfill relies on timing (a 50 ms delay, a 5 s window).
- Only code that calls `AuditService` is audited; not every endpoint is. Many domain events (`tenant.*`, `roles.*`, `auth.*`, `device.*`) have no listener at all.
