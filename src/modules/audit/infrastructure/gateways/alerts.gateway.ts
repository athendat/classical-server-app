import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, Inject } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import type { IAuthService } from '../../../auth/domain/ports/auth.port';
import { INJECTION_TOKENS } from 'src/common/constants/injection-tokens';

/**
 * Socket.IO gateway for real-time event broadcasting.
 * Namespace: /alerts
 * Max connections: 5 per server (configurable)
 */
@WebSocketGateway({
  namespace: 'alerts',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class AlertsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(AlertsGateway.name);
  private connectedClients = new Map<string, Socket>();
  private readonly maxConnections = 5;

  @WebSocketServer()
  server: Server;

  constructor(
    @Inject(INJECTION_TOKENS.AUTH_SERVICE)
    private readonly authService: IAuthService,
  ) {}

  /**
   * Initialize gateway.
   */
  afterInit(server: Server): void {
    this.logger.log('Alerts gateway initialized');
  }

  /**
   * Handle client connection.
   */
  async handleConnection(client: Socket): Promise<void> {
    try {
      // Check max connections
      if (this.connectedClients.size >= this.maxConnections) {
        this.logger.warn(
          `Max connections (${this.maxConnections}) reached, rejecting ${client.id}`,
        );
        client.disconnect();
        return;
      }

      // Verify JWT token from handshake
      const auth = client.handshake.auth as { token?: unknown };
      const tokenFromAuth =
        typeof auth.token === 'string' ? auth.token : undefined;
      const authHeader = client.handshake.headers.authorization;
      const tokenFromHeader =
        typeof authHeader === 'string' ? authHeader.split(' ')[1] : undefined;

      const token = tokenFromAuth ?? tokenFromHeader;

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      // Verify token
      const verifyResult = await this.authService.verifyJWT(token);
      if (verifyResult.isFailure) {
        this.logger.warn(
          `Client ${client.id} provided invalid token: ${verifyResult.getError().message}`,
        );
        client.disconnect();
        return;
      }

      const payload = verifyResult.getValue();
      this.connectedClients.set(client.id, client);

      this.logger.log(
        `Client ${client.id} connected (actor: ${payload.sub}, total: ${this.connectedClients.size})`,
      );

      // Send confirmation
      client.emit('connected', {
        message: 'Connected to alerts gateway',
        clientId: client.id,
        maxConnections: this.maxConnections,
      });
    } catch (error: any) {
      this.logger.error(
        `Error handling connection: ${(error as Error).message}`,
      );
      client.disconnect();
    }
  }

  /**
   * Handle client disconnection.
   */
  handleDisconnect(client: Socket): void {
    this.connectedClients.delete(client.id);
    this.logger.log(
      `Client ${client.id} disconnected (total: ${this.connectedClients.size})`,
    );
  }

  /**
   * Broadcast event to all connected clients.
   */
  broadcastEvent(eventType: string, data: unknown, excludeClientId?: string): void {
    let count = 0;

    const payload: { type: string; data: unknown; timestamp: number } = {
      type: eventType,
      data,
      timestamp: Date.now(),
    };

    for (const [clientId, socket] of this.connectedClients.entries()) {
      if (excludeClientId && clientId === excludeClientId) continue;

      socket.emit('event', payload);

      count++;
    }

    if (count > 0) {
      this.logger.log(`Broadcasted event '${eventType}' to ${count} clients`);
    }
  }

  /**
   * Message handler: ping (for heartbeat).
   */
  @SubscribeMessage('ping')
  handlePing(client: Socket): void {
    client.emit('pong', { timestamp: Date.now() });
  }

  /**
   * Get connection stats.
   */
  getStats(): {
    connectedClients: number;
    maxConnections: number;
    utilization: number;
  } {
    return {
      connectedClients: this.connectedClients.size,
      maxConnections: this.maxConnections,
      utilization: (this.connectedClients.size / this.maxConnections) * 100,
    };
  }
}
