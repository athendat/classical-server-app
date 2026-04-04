# PaymentsGateway — WebSocket Payment Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate a Socket.IO WebSocket gateway (`/payments`) that lets POS terminals receive real-time confirmation of payment intents they created, scoped to a room named after the `intentId`.

**Architecture:** A new `PaymentsGateway` is added to the `transactions` module. On connection the POS authenticates with its OAuth2 machine JWT; it then emits a `join` event with its `intentId` to subscribe to a Socket.IO room. When `transaction.processed`, `transaction.expired`, or `transaction.cancelled` domain events fire (via EventEmitter2), the gateway looks up the transaction's `intentId` from the repository and emits a `payment.result` event to that room.

**Tech Stack:** NestJS 11, `@nestjs/websockets`, Socket.io, EventEmitter2 `@OnEvent`, Mongoose via `TransactionsRepository`, `IJwtTokenPort` for JWT validation, Jest for unit tests.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/modules/transactions/infrastructure/gateways/payments.gateway.ts` | WebSocket gateway: auth, room management, domain event listener |
| Create | `src/modules/transactions/infrastructure/gateways/payments.gateway.spec.ts` | Unit tests for the gateway |
| Modify | `src/modules/transactions/transactions.module.ts` | Register `PaymentsGateway`, import `AuthModule` |

---

## Task 1: Write failing unit tests for `PaymentsGateway`

**Files:**
- Create: `src/modules/transactions/infrastructure/gateways/payments.gateway.spec.ts`

- [ ] **Step 1: Create the test file**

```typescript
// src/modules/transactions/infrastructure/gateways/payments.gateway.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsGateway } from './payments.gateway';
import { TransactionsRepository } from '../../adapters/transactions.repository';
import { Result } from 'src/common/types/result.type';
import { TransactionProcessedEvent, TransactionExpiredEvent, TransactionCancelledEvent } from '../../../domain/events/transaction.events';

describe('PaymentsGateway', () => {
  let gateway: PaymentsGateway;
  let jwtTokenPort: { verify: jest.Mock };
  let transactionsRepository: { findById: jest.Mock };
  let mockServer: { to: jest.Mock; emit: jest.Mock };

  beforeEach(async () => {
    jwtTokenPort = { verify: jest.fn() };
    transactionsRepository = { findById: jest.fn() };
    mockServer = { to: jest.fn().mockReturnThis(), emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsGateway,
        { provide: 'IJwtTokenPort', useValue: jwtTokenPort },
        { provide: TransactionsRepository, useValue: transactionsRepository },
      ],
    }).compile();

    gateway = module.get<PaymentsGateway>(PaymentsGateway);
    gateway.server = mockServer as any;
  });

  // --- handleConnection ---

  describe('handleConnection', () => {
    it('should disconnect if no token is present', async () => {
      const client = {
        id: 'c1',
        handshake: { auth: {}, headers: {} },
        disconnect: jest.fn(),
        emit: jest.fn(),
      } as any;

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
      expect(client.emit).not.toHaveBeenCalledWith('connected', expect.anything());
    });

    it('should disconnect if token verification fails', async () => {
      jwtTokenPort.verify.mockResolvedValue(Result.fail(new Error('invalid token')));

      const client = {
        id: 'c1',
        handshake: { auth: { token: 'bad-token' }, headers: {} },
        disconnect: jest.fn(),
        emit: jest.fn(),
      } as any;

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should accept connection and emit connected when token is valid', async () => {
      jwtTokenPort.verify.mockResolvedValue(Result.ok({ sub: 'pos-terminal-1' }));

      const client = {
        id: 'c1',
        handshake: { auth: { token: 'valid-token' }, headers: {} },
        disconnect: jest.fn(),
        emit: jest.fn(),
      } as any;

      await gateway.handleConnection(client);

      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith('connected', {
        message: 'Connected to payments gateway',
        clientId: 'c1',
      });
    });

    it('should accept token from Authorization header', async () => {
      jwtTokenPort.verify.mockResolvedValue(Result.ok({ sub: 'pos-terminal-2' }));

      const client = {
        id: 'c2',
        handshake: {
          auth: {},
          headers: { authorization: 'Bearer header-token' },
        },
        disconnect: jest.fn(),
        emit: jest.fn(),
      } as any;

      await gateway.handleConnection(client);

      expect(jwtTokenPort.verify).toHaveBeenCalledWith('header-token');
      expect(client.disconnect).not.toHaveBeenCalled();
    });
  });

  // --- handleJoin ---

  describe('handleJoin', () => {
    it('should join the room named after the intentId and confirm', () => {
      const client = { join: jest.fn(), emit: jest.fn() } as any;

      gateway.handleJoin(client, { intentId: 'intent-uuid-123' });

      expect(client.join).toHaveBeenCalledWith('intent-uuid-123');
      expect(client.emit).toHaveBeenCalledWith('joined', { intentId: 'intent-uuid-123' });
    });
  });

  // --- handleTransactionProcessed ---

  describe('handleTransactionProcessed', () => {
    it('should emit payment.result to the intentId room on success', async () => {
      transactionsRepository.findById.mockResolvedValue({
        id: 'txn-1',
        intentId: 'intent-abc',
      });

      await gateway.handleTransactionProcessed(
        new TransactionProcessedEvent('txn-1', 'tenant-1', 'success'),
      );

      expect(mockServer.to).toHaveBeenCalledWith('intent-abc');
      expect(mockServer.emit).toHaveBeenCalledWith(
        'payment.result',
        expect.objectContaining({
          transactionId: 'txn-1',
          intentId: 'intent-abc',
          status: 'success',
        }),
      );
    });

    it('should emit payment.result with error on failure', async () => {
      transactionsRepository.findById.mockResolvedValue({
        id: 'txn-2',
        intentId: 'intent-def',
      });

      await gateway.handleTransactionProcessed(
        new TransactionProcessedEvent('txn-2', 'tenant-1', 'failed', 'Saldo insuficiente'),
      );

      expect(mockServer.emit).toHaveBeenCalledWith(
        'payment.result',
        expect.objectContaining({
          status: 'failed',
          error: 'Saldo insuficiente',
        }),
      );
    });

    it('should do nothing if transaction is not found', async () => {
      transactionsRepository.findById.mockResolvedValue(null);

      await gateway.handleTransactionProcessed(
        new TransactionProcessedEvent('txn-x', 'tenant-1', 'success'),
      );

      expect(mockServer.to).not.toHaveBeenCalled();
    });
  });

  // --- handleTransactionExpired ---

  describe('handleTransactionExpired', () => {
    it('should emit payment.result with status expired to the intentId room', async () => {
      transactionsRepository.findById.mockResolvedValue({
        id: 'txn-3',
        intentId: 'intent-ghi',
      });

      await gateway.handleTransactionExpired(
        new TransactionExpiredEvent('txn-3', 'tenant-1'),
      );

      expect(mockServer.to).toHaveBeenCalledWith('intent-ghi');
      expect(mockServer.emit).toHaveBeenCalledWith(
        'payment.result',
        expect.objectContaining({ status: 'expired' }),
      );
    });

    it('should do nothing if transaction is not found', async () => {
      transactionsRepository.findById.mockResolvedValue(null);

      await gateway.handleTransactionExpired(
        new TransactionExpiredEvent('txn-y', 'tenant-1'),
      );

      expect(mockServer.to).not.toHaveBeenCalled();
    });
  });

  // --- handleTransactionCancelled ---

  describe('handleTransactionCancelled', () => {
    it('should emit payment.result with status cancelled to the intentId room', async () => {
      transactionsRepository.findById.mockResolvedValue({
        id: 'txn-4',
        intentId: 'intent-jkl',
      });

      await gateway.handleTransactionCancelled(
        new TransactionCancelledEvent('txn-4', 'tenant-1'),
      );

      expect(mockServer.to).toHaveBeenCalledWith('intent-jkl');
      expect(mockServer.emit).toHaveBeenCalledWith(
        'payment.result',
        expect.objectContaining({ status: 'cancelled' }),
      );
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail (class does not exist yet)**

```bash
cd classical-server-app && yarn test -- src/modules/transactions/infrastructure/gateways/payments.gateway.spec.ts --no-coverage
```

Expected: FAIL — `Cannot find module './payments.gateway'`

---

## Task 2: Implement `PaymentsGateway`

**Files:**
- Create: `src/modules/transactions/infrastructure/gateways/payments.gateway.ts`

- [ ] **Step 3: Create the gateway implementation**

```typescript
// src/modules/transactions/infrastructure/gateways/payments.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';

import type { IJwtTokenPort } from 'src/modules/auth/domain/ports/jwt-token.port';
import { TransactionsRepository } from '../../adapters/transactions.repository';
import {
  TransactionProcessedEvent,
  TransactionExpiredEvent,
  TransactionCancelledEvent,
} from '../../../domain/events/transaction.events';

@WebSocketGateway({
  namespace: 'payments',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class PaymentsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(PaymentsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    @Inject('IJwtTokenPort')
    private readonly jwtTokenPort: IJwtTokenPort,
    private readonly transactionsRepository: TransactionsRepository,
  ) {}

  /**
   * Validates the OAuth2 machine token on connect.
   * Disconnects the client if the token is missing or invalid.
   */
  async handleConnection(client: Socket): Promise<void> {
    try {
      const auth = client.handshake.auth as { token?: unknown };
      const tokenFromAuth = typeof auth.token === 'string' ? auth.token : undefined;
      const authHeader = client.handshake.headers.authorization;
      const tokenFromHeader =
        typeof authHeader === 'string' ? authHeader.split(' ')[1] : undefined;

      const token = tokenFromAuth ?? tokenFromHeader;

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token — disconnecting`);
        client.disconnect();
        return;
      }

      const verifyResult = await this.jwtTokenPort.verify(token);
      if (verifyResult.isFailure) {
        this.logger.warn(
          `Client ${client.id} provided invalid token: ${verifyResult.getError().message}`,
        );
        client.disconnect();
        return;
      }

      const payload = verifyResult.getValue();
      this.logger.log(`Client ${client.id} connected (sub: ${payload.sub})`);

      client.emit('connected', {
        message: 'Connected to payments gateway',
        clientId: client.id,
      });
    } catch (error: any) {
      this.logger.error(`Error handling connection for ${client.id}: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  /**
   * Subscribes the POS terminal to a room named after the payment intentId.
   * The POS must call this right after connecting, passing the intentId it generated.
   *
   * @example
   * socket.emit('join', { intentId: 'uuid-v4' })
   * socket.on('joined', ({ intentId }) => { ... })
   */
  @SubscribeMessage('join')
  handleJoin(client: Socket, data: { intentId: string }): void {
    const { intentId } = data;
    client.join(intentId);
    client.emit('joined', { intentId });
    this.logger.log(`Client ${client.id} joined room ${intentId}`);
  }

  /**
   * Listens for transaction.processed domain event.
   * Looks up the intentId for the transaction and emits payment.result to its room.
   */
  @OnEvent('transaction.processed')
  async handleTransactionProcessed(event: TransactionProcessedEvent): Promise<void> {
    const transaction = await this.transactionsRepository.findById(event.transactionId);
    if (!transaction) {
      this.logger.warn(`transaction.processed: transaction ${event.transactionId} not found`);
      return;
    }

    this.server.to(transaction.intentId).emit('payment.result', {
      transactionId: event.transactionId,
      intentId: transaction.intentId,
      status: event.status,
      error: event.error ?? null,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `Emitted payment.result (${event.status}) to room ${transaction.intentId}`,
    );
  }

  /**
   * Listens for transaction.expired domain event.
   * Emits payment.result with status 'expired' to the intentId room.
   */
  @OnEvent('transaction.expired')
  async handleTransactionExpired(event: TransactionExpiredEvent): Promise<void> {
    const transaction = await this.transactionsRepository.findById(event.transactionId);
    if (!transaction) {
      this.logger.warn(`transaction.expired: transaction ${event.transactionId} not found`);
      return;
    }

    this.server.to(transaction.intentId).emit('payment.result', {
      transactionId: event.transactionId,
      intentId: transaction.intentId,
      status: 'expired',
      error: null,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Emitted payment.result (expired) to room ${transaction.intentId}`);
  }

  /**
   * Listens for transaction.cancelled domain event.
   * Emits payment.result with status 'cancelled' to the intentId room.
   */
  @OnEvent('transaction.cancelled')
  async handleTransactionCancelled(event: TransactionCancelledEvent): Promise<void> {
    const transaction = await this.transactionsRepository.findById(event.transactionId);
    if (!transaction) {
      this.logger.warn(`transaction.cancelled: transaction ${event.transactionId} not found`);
      return;
    }

    this.server.to(transaction.intentId).emit('payment.result', {
      transactionId: event.transactionId,
      intentId: transaction.intentId,
      status: 'cancelled',
      error: null,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Emitted payment.result (cancelled) to room ${transaction.intentId}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd classical-server-app && yarn test -- src/modules/transactions/infrastructure/gateways/payments.gateway.spec.ts --no-coverage
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/transactions/infrastructure/gateways/payments.gateway.ts \
        src/modules/transactions/infrastructure/gateways/payments.gateway.spec.ts
git commit -m "feat(transactions): add PaymentsGateway for real-time POS payment confirmation"
```

---

## Task 3: Register `PaymentsGateway` in `TransactionsModule`

**Files:**
- Modify: `src/modules/transactions/transactions.module.ts`

- [ ] **Step 6: Add `AuthModule` import and `PaymentsGateway` provider**

In `src/modules/transactions/transactions.module.ts`:

Add to imports array (top of file):
```typescript
import { AuthModule } from '../auth/auth.module';
import { PaymentsGateway } from './infrastructure/gateways/payments.gateway';
```

Add `AuthModule` to the `imports` array inside `@Module`:
```typescript
imports: [
    AuditModule,
    MongooseModule.forFeature([...]),
    ScheduleModule.forRoot(),
    CommonModule,
    CardsModule,
    TenantsModule,
    UsersModule,
    AuthModule,          // ← add this
],
```

Add `PaymentsGateway` to the `providers` array:
```typescript
providers: [
    AsyncContextService,
    MongoDbSequenceAdapter,
    TransactionsRepository,
    TransactionService,
    TransactionQueryService,
    DashboardService,
    TenantWebhookDispatcher,
    TestTransactionService,
    TransactionPaymentProcessor,
    TransactionExpirationTask,
    PaymentsGateway,     // ← add this
],
```

- [ ] **Step 7: Build to verify no TypeScript errors**

```bash
cd classical-server-app && yarn build 2>&1 | tail -20
```

Expected: build completes with no errors

- [ ] **Step 8: Run the full test suite**

```bash
cd classical-server-app && yarn test --no-coverage 2>&1 | tail -30
```

Expected: all tests pass, no regressions

- [ ] **Step 9: Commit**

```bash
git add src/modules/transactions/transactions.module.ts
git commit -m "feat(transactions): register PaymentsGateway and import AuthModule"
```

---

## Task 4: Smoke test — manual integration verification

- [ ] **Step 10: Start the server in dev mode**

```bash
cd classical-server-app && yarn start:dev
```

Expected: server starts, log line appears: `Alerts gateway initialized` is replaced by (or followed by) logs from `PaymentsGateway`.

- [ ] **Step 11: Connect a test WebSocket client and verify auth**

Use any Socket.io client (e.g., `wscat`, Postman, or a small Node script):

```js
// test-ws.js — run with: node test-ws.js
const { io } = require('socket.io-client');

// Replace with a valid machine JWT from your dev environment
const TOKEN = 'eyJ...';

const socket = io('http://localhost:9053/payments', {
  auth: { token: TOKEN },
});

socket.on('connected', (data) => {
  console.log('Connected:', data);
  // Join the intent room
  socket.emit('join', { intentId: 'test-intent-001' });
});

socket.on('joined', (data) => {
  console.log('Joined room:', data);
});

socket.on('payment.result', (data) => {
  console.log('Payment result:', JSON.stringify(data, null, 2));
});

socket.on('disconnect', () => {
  console.log('Disconnected');
});
```

Expected sequence of log output:
1. `Client <id> connected (sub: <clientId>)`
2. `Client <id> joined room test-intent-001`

- [ ] **Step 12: Trigger a payment and verify the POS receives the result**

With the WS client connected and joined to a room for a real `intentId`:

1. Create a transaction via `POST /api_053/transactions` using that same `intentId`
2. Confirm the transaction from the mobile app via `POST /api_053/transactions/confirm`
3. Observe the WS client console

Expected: `payment.result` event arrives with `{ status: 'success' | 'failed', transactionId, intentId, timestamp }`.

---

## POS Integration Reference

Once deployed, the POS connects and listens like this:

```
1. POST /api_053/transactions           → creates intent, receives { id, intentId, emvco, ... }
2. Connect: ws://host/payments          → { auth: { token: '<machine_jwt>' } }
3. On 'connected':  emit 'join'         → { intentId }
4. On 'joined':     display QR (emvco)  → wait for result
5. On 'payment.result':
     status === 'success'  → show approved screen
     status === 'failed'   → show declined screen + error
     status === 'expired'  → show timeout screen
     status === 'cancelled'→ show cancelled screen
```

### `payment.result` payload shape

```json
{
  "transactionId": "uuid",
  "intentId": "uuid",
  "status": "success" | "failed" | "expired" | "cancelled",
  "error": "string | null",
  "timestamp": "2026-04-03T12:00:00.000Z"
}
```
