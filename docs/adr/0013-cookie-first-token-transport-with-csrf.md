# Tokens travel in httpOnly cookies first, bearer header second, with double-submit CSRF

Login and refresh always put the access and refresh tokens in httpOnly cookies (`SameSite=None; Secure` in production, so the back office can be on another origin) and never in the response body. The JWT strategy reads the cookie first and falls back to an `Authorization: Bearer` header for machine clients.

Because the browser sends cookies automatically, a global `CsrfGuard` uses the double-submit pattern: the `XSRF-TOKEN` cookie must equal the `x-csrf-token` header, and the token must still exist in Redis. The check is skipped when a request has a bearer header and no `access_token` cookie, because CSRF cannot happen there.

## Consequences

- Mobile clients must also handle cookies. The "tokens in body for mobile" branch cannot run.
- Tokens are never rotated on use. Refresh issues a new access token but reuses the refresh token until it expires.
