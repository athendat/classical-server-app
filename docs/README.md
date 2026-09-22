# Documentation

The domain glossary is [`CONTEXT.md`](../CONTEXT.md) at the repo root. The agent guide is [`CLAUDE.md`](../CLAUDE.md), and the security policy is [`SECURITY.md`](../SECURITY.md).

> Many of these documents were written before or during implementation, and some no longer match the code. Where a document and an ADR disagree, the ADR wins.

## [`adr/`](./adr) — Architecture decisions

Architecture Decision Records: the decisions that are hard to reverse, and why they were made.

## [`integration-guides/`](./integration-guides) — Integration guides

For anyone consuming this API or integrating with the services around it: frontend, mobile app, SGT.

| Document | Topic |
|---|---|
| [COOKIES_CLIENT_SETUP](./integration-guides/COOKIES_CLIENT_SETUP.md) | Client configuration for cookie authentication |
| [PROFILE_ENDPOINTS](./integration-guides/PROFILE_ENDPOINTS.md) | Profile endpoints for the signed-in user |
| [LOGIN_TROUBLESHOOTING](./integration-guides/LOGIN_TROUBLESHOOTING.md) | Login troubleshooting |
| [JWT_ISSUER_TROUBLESHOOTING](./integration-guides/JWT_ISSUER_TROUBLESHOOTING.md) | "jwt issuer invalid" error on refresh |
| [INVALID_TOKEN_TYPE_FIX](./integration-guides/INVALID_TOKEN_TYPE_FIX.md) | Refresh token type |
| [CAPTURA_SEGURA_DEL_PIN](./integration-guides/CAPTURA_SEGURA_DEL_PIN.md) | PIN capture in the mobile app |
| [IMPLEMENTATION_EMVCO](./integration-guides/IMPLEMENTATION_EMVCO.md) | Payment QR (EMVCo) for the app |
| [HMAC_AUTH_GUIDE](./integration-guides/HMAC_AUTH_GUIDE.md) | HMAC signing of requests to SGT |
| [SGT_PINBLOCK_SPECIFICATION](./integration-guides/SGT_PINBLOCK_SPECIFICATION.md) | SGT PIN block format |

## [`project/`](./project) — Project documentation and architecture

Internal design and implementation of the backend.

| Document | Topic |
|---|---|
| [BOOTSTRAP_IMPLEMENTATION](./project/BOOTSTRAP_IMPLEMENTATION.md) | System initialization (seeds) |
| [BOOTSTRAP_CHECKLIST](./project/BOOTSTRAP_CHECKLIST.md) | Bootstrap checklist |
| [IMPLEMENTATION_SUMMARY](./project/IMPLEMENTATION_SUMMARY.md) | Multi-role users and Merchant self-registration |
| [SESSION_CACHE_IMPLEMENTATION](./project/SESSION_CACHE_IMPLEMENTATION.md) | Login session cache in Redis |
| [REPOSITORY_PATTERN_EXAMPLE](./project/REPOSITORY_PATTERN_EXAMPLE.md) | Repository pattern |
| [PROPUESTA_COMERCIAL_PASARELA_PAGOS](./project/PROPUESTA_COMERCIAL_PASARELA_PAGOS.md) | Commercial proposal for the payment gateway |

## Others

- [`agents/`](./agents) — configuration for agent skills (issue tracker, labels, domain docs).
- [`superpowers/plans/`](./superpowers/plans) — implementation plans.
