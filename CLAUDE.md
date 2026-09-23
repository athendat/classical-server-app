# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Classical Server App** is a NestJS backend for FxWallet, a fintech wallet platform. It provides APIs for user management, card operations, transactions, authentication, and administrative functions. The application uses a hexagonal architecture pattern with clear separation between domain, application, and infrastructure layers.

### Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: NestJS 11.x
- **Database**: MongoDB with Mongoose
- **Caching**: Redis (via ioredis)
- **Key Management**: HashiCorp Vault
- **API Documentation**: Swagger
- **Authentication**: JWT with RS256 + JWKS, Passport.js
- **Logging**: Winston
- **Package Manager**: Yarn

### Key Features

- Secure authentication with JWT token rotation and anti-replay protection
- Card management with PIN block encryption (ISO4 standard)
- Event-driven audit logging system
- CSRF protection with token-based validation
- Device key exchange using ECDH P-256
- Multi-tenant support with role-based access control
- Rate limiting and throttling
- WebSocket support for real-time updates
- System bootstrap with phase-based initialization

---

## Development Commands

### Installation & Setup

```bash
# Install dependencies
yarn install

# Setup environment variables
cp .env.example .env
# Then edit .env with your configuration values
```

### Build & Run

```bash
# Development mode (with hot reload)
yarn start:dev

# Debug mode (with inspector on port 9229)
yarn start:debug

# Build for production
yarn build

# Production mode (requires build first)
yarn start:prod
```

### Code Quality

```bash
# Format code with Prettier
yarn format

# Lint with ESLint (auto-fixes issues)
yarn lint
```

### Testing

```bash
# Run all unit tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run specific test file
yarn test -- src/modules/auth/auth.service.spec.ts

# Generate coverage report
yarn test:cov

# Run e2e tests
yarn test:e2e

# Debug tests
yarn test:debug
```

### Useful Endpoints

- **API Base**: `http://localhost:9053/api_053`
- **Swagger UI**: `http://localhost:9053/swagger`
- **Health Check**: `http://localhost:9053/health`
- **Metrics**: `http://localhost:9053/metrics`

---

## Architecture & Code Organization

### High-Level Structure

```text
src/
├── app.module.ts                    # Root module with global configuration
├── app.controller.ts                # Basic health check endpoint
├── main.ts                          # Application bootstrap entry point
│
├── modules/                         # Feature modules (hexagonal architecture)
│   ├── audit/                       # Event audit logging
│   ├── auth/                        # Authentication & JWT management
│   ├── cards/                       # Card operations & PIN management
│   ├── csrf/                        # CSRF protection
│   ├── devices/                     # Device management & key exchange
│   ├── permissions/                 # Permission definitions
│   ├── roles/                       # Role-based access control
│   ├── tenants/                     # Multi-tenant support
│   ├── transactions/                # Transaction history & operations
│   ├── users/                       # User management
│   └── vault/                       # Vault integration for key storage
│
├── common/                          # Cross-cutting concerns
│   ├── bootstrap/                   # System initialization (4-phase bootstrap)
│   ├── cache/                       # Redis caching & anti-replay mechanisms
│   ├── constants/                   # Application constants & injection tokens
│   ├── context/                     # Async local context (nestjs-cls)
│   ├── crypto/                      # Encryption utilities
│   ├── emvco/                       # EMV/EMVCO standard implementations
│   ├── events/                      # Event definitions
│   ├── helpers/                     # Utility functions
│   ├── http/                        # HTTP client wrapper with interceptors
│   ├── interceptors/                # Global interceptors (audit, auth, error)
│   ├── interfaces/                  # TypeScript interfaces & contracts
│   ├── schemas/                     # Mongoose schema definitions
│   ├── sms/                         # SMS service integration
│   ├── types/                       # TypeScript type definitions
│   └── validators/                  # Custom validation decorators
│
├── middlewares/                     # Express middleware
│   ├── auth.middleware.ts           # Token extraction & validation
│   ├── logging.middleware.ts        # Request/response logging
│   └── request-id.middleware.ts     # Unique request ID generation
│
├── shared/                          # Shared utilities across modules
│   └── shared-context.module.ts     # Async context service setup
│
└── config/                          # Environment configuration
    └── config.schema.ts             # Joi validation schema for env vars
```

### Module Architecture Pattern

Each feature module follows **hexagonal architecture**:

```text
modules/<feature>/
├── application/                     # Business logic layer
│   ├── <feature>.service.ts        # Main service with core logic
│   └── <feature>-*.service.ts      # Supporting services
│
├── infrastructure/                  # External integrations & persistence
│   ├── adapters/                   # Database & external service adapters
│   ├── controllers/                # HTTP endpoints
│   ├── guards/                     # Route guards
│   ├── pipes/                      # Data transformation pipes
│   ├── schemas/                    # Mongoose document schemas
│   └── services/                   # Infrastructure services (ex: SMS, HTTP)
│
├── <feature>.module.ts             # Module configuration & DI setup
└── strategies/                     # Auth strategies (if applicable)
```

**Example**: The `cards` module handles card operations:

- **Application Layer**: `CardsService` contains business logic for card management
- **Infrastructure Layer**: `CardVaultAdapter` integrates with Vault, `CardsRepository` handles persistence, `SgtCardAdapter` integrates with external card services

### Global Initialization (4-Phase Bootstrap)

The system initializes in sequence via `SystemBootstrapService`:

1. **Phase 1**: Create system modules (base for permissions)
2. **Phase 2**: Create permissions (base for roles)
3. **Phase 3**: Create roles (base for users)
4. **Phase 4**: Create super admin user

This ensures all dependencies exist before dependent entities are created. Bootstrap is controlled by `SEED_ENABLED` and `SEED_ENABLED_VAULT` environment variables.

### Key Middleware Order (Important!)

Configured in `app.module.ts`:

1. **Cookie Parser** - FIRST: Extracts cookies from headers
2. **Logging Middleware** - Logs all requests/responses
3. **Request ID Middleware** - Adds unique request ID to context
4. **Auth Middleware** - Validates JWT tokens (excluded from `/auth/*` routes)

The order is critical because middlewares have dependencies (auth needs cookies, logging needs request ID).

### Global Features

- **Async Context**: Uses `nestjs-cls` to propagate context through async operations (available via `ClsService`)
- **Audit Interceptor**: Logs all endpoint calls with request/response data and actor info
- **CSRF Protection**: Global guard validates `x-csrf-token` header (see `CsrfGuard`)
- **Validation Pipes**: Global `ValidationPipe` enforces DTO validation with whitelist & forbidNonWhitelisted
- **Error Handling**: Custom exception filters in controllers handle business errors gracefully

---

## Environment Variables

Key variables required in `.env`:

```text
# Application
PORT=9053
APP_NAME=classical-server-app
NODE_ENV=development
ENVIRONMENT=DEVELOPMENT

# Database
DB_HOST=mongodb://localhost:27017/fxwallet

# Cache & Sessions
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_ROOT_KEY=app_
REDIS_TTL=3600

# Authentication
JWT_SECRET=your-jwt-secret
COOKIE_SECRET=your-cookie-secret
COOKIE_DOMAIN=localhost

# External Services
SGT_URL=https://sgt-service-url
SGT_CLIENT_ID=client-id
SGT_AES_KEY=aes-key
SGT_AES_IV=aes-iv
SGT_HMAC_SECRET=hmac-secret
SMS_API_URL=https://sms-service-url
SMS_TOKEN=sms-token

# Vault (Key Management)
VAULT_ADDR=https://vault.example.com
VAULT_NAMESPACE=your-namespace
VAULT_KV_MOUNT=secret
VAULT_TOKEN=vault-token
VAULT_ROLE_ID=role-id
VAULT_SECRET_ID=secret-id

# CORS
CORS_ORIGIN=http://localhost:4200,http://localhost:3000

# Bootstrap
SEED_ENABLED=true
SEED_ENABLED_VAULT=true
```

---

## Common Development Tasks

### Adding a New Module

1. Create module directory: `src/modules/<feature>/`
2. Create subdirectories: `application/`, `infrastructure/`, `infrastructure/adapters/`, `infrastructure/controllers/`
3. Create main service in `application/<feature>.service.ts`
4. Create controller in `infrastructure/controllers/<feature>.controller.ts`
5. Create `<feature>.module.ts` with proper DI configuration
6. Import the module in `app.module.ts`

### Working with Audit Logs

The `AuditModule` logs all endpoint calls:

- Triggered by global `AuditInterceptor`
- Stores events in MongoDB `AuditEvent` collection
- Gets actor info (user ID, role) from async context via `ClsService`
- Access via `AuditService` for querying logs

### Testing

- Unit tests: `*.spec.ts` files run via `jest` from `src/` directory
- E2E tests: `*.e2e-spec.ts` files in `test/` directory
- Use `@nestjs/testing` module to create test module with necessary providers
- Mock external dependencies (Vault, Redis, MongoDB) in tests
- Coverage report available at `coverage/` after `yarn test:cov`

### Handling JWT & Authentication

- JWT strategy defined in `auth/strategies/jwt.strategy.ts`
- Tokens include `jti` (JWT ID) for anti-replay protection
- Keys stored in Vault, accessed via `VaultService`
- Token validation done in `AuthMiddleware` before request reaches controllers
- Current user accessible via `@GetActor()` decorator (available in `auth` module)

### Working with Vault

- `VaultModule` provides `VaultService` for key management
- Call `VaultService.readSecret(path)` to fetch secrets from Vault
- Used for storing JWT private keys, card encryption keys, and other sensitive data
- Initialize during bootstrap if `SEED_ENABLED_VAULT=true`

### Database Operations

- Use Mongoose schemas (defined in `infrastructure/schemas/`)
- Repositories (in `infrastructure/adapters/`) handle database queries
- Follow repository pattern: controllers call services, services call adapters/repositories
- Example: `CardsRepository` provides `findByUserId()`, `create()`, `update()`, etc.

---

## Code Style & Standards

- **Formatting**: Prettier (run `yarn format` before committing)
- **Linting**: ESLint with TypeScript support (run `yarn lint` to auto-fix)
- **Naming Conventions**:
  - Classes: PascalCase (e.g., `UserService`, `AuthGuard`)
  - Files: kebab-case (e.g., `user.service.ts`, `auth.guard.ts`)
  - Constants: UPPER_SNAKE_CASE (e.g., `MAX_LOGIN_ATTEMPTS`)
- **Decorators**: Use NestJS decorators (`@Controller()`, `@Get()`, `@Param()`, etc.)
- **DTOs**: Define with class-validator for validation
- **Dependency Injection**: Use constructor injection with `@Inject()` when needed

---

## Debugging Tips

### Logs

- All logs go through Winston logger
- Check console output or `logs/error.log` and `logs/combined.log`
- Add context to logs: `Logger.log('message', 'ContextName')`

### Async Context Issues

- Use `ClsService` to access request context within async operations
- Example: `const userId = this.cls.get('user_id')`
- Injected via `import { ClsService } from 'nestjs-cls'`

### Database Debugging

- Use MongoDB Compass to inspect collections
- Check `AuditEvent` collection to see endpoint calls
- Use `yarn start:debug` to set breakpoints in VSCode

### Token Issues

- Check `auth.service.ts` for token generation logic
- Verify JWT_SECRET is set correctly
- Anti-replay: check `SessionExpirationScheduler` for expired token cleanup

---

## Important Files Reference

| File | Purpose |
| ------ | --------- |
| `src/app.module.ts` | Root module with global configuration, middleware setup, providers |
| `src/main.ts` | Bootstrap entry point: Winston logger config, CORS, Swagger setup |
| `src/config/config.schema.ts` | Joi validation schema for all env variables |
| `src/common/context/async-context.service.ts` | Request context propagation (uses nestjs-cls) |
| `src/common/interceptors/audit.interceptor.ts` | Global audit logging interceptor |
| `src/common/bootstrap/system-bootstrap.service.ts` | 4-phase system initialization |
| `src/modules/auth/auth.service.ts` | JWT generation, validation, anti-replay logic |
| `src/modules/cards/cards.service.ts` | Card operations: create, update, activate, block |
| `src/modules/vault/vault.service.ts` | Vault integration for secure key storage |

## Agent skills

### Issue tracker

Issues live as GitHub issues in `athendat/classical-server-app` (the `upstream` remote), managed with the `gh` CLI. External pull requests are **not** a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical vocabulary, unmapped: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. Neither exists yet — created lazily by `/domain-modeling`. See `docs/agents/domain.md`.
