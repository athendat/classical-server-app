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

import type { IJwtTokenPort } from 'src/modules/auth/domain/ports/jwt-token.port';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  path: '/api_053/socket',
  transports: ['websocket'],
})
export class SocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SocketGateway.name);
  private connectedClients: Map<string, string[]> = new Map();

  @WebSocketServer()
  server: Server;

  constructor(
    @Inject('IJwtTokenPort')
    private readonly jwtTokenPort: IJwtTokenPort,
  ) {}

  afterInit(server: Server): void {
    this.logger.log('Socket.IO server initialized');
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);

    if (!token) {
      this.logger.warn(`Client ${client.id} connected without token — disconnecting`);
      client.disconnect();
      return;
    }

    try {
      const verifyResult = await this.jwtTokenPort.verify(token);
      if (verifyResult.isFailure) {
        this.logger.warn(`Client ${client.id} invalid token: ${verifyResult.getError().message}`);
        client.disconnect();
        return;
      }

      const payload = verifyResult.getValue();
      const userId = payload.sub as string;
      const clientIds = this.connectedClients.get(userId) || [];
      clientIds.push(client.id);
      this.connectedClients.set(userId, clientIds);
      this.logger.log(`Client ${client.id} connected (sub: ${userId})`);

      client.emit('connected', {
        message: 'Connected to socket gateway',
        clientId: client.id,
      });
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error handling connection for ${client.id}: ${errorMsg}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    for (const [userId, clientIds] of this.connectedClients.entries()) {
      const index = clientIds.indexOf(client.id);
      if (index !== -1) {
        clientIds.splice(index, 1);
        if (clientIds.length === 0) {
          this.connectedClients.delete(userId);
        }
        this.logger.log(`Client ${userId} (${client.id}) disconnected`);
        return;
      }
    }
    this.logger.log(`Client ${client.id} disconnected (untracked)`);
  }

  @SubscribeMessage('join')
  handleJoin(client: Socket, data: { room: string }): void {
    const { room } = data;
    if (!room || typeof room !== 'string' || room.trim().length === 0) {
      client.emit('error', { message: 'room is required' });
      return;
    }
    client.join(room);
    client.emit('joined', { room });
    this.logger.log(`Client ${client.id} joined room ${room}`);
  }

  sendMessage(event: string, payload: any = null, usersId?: string[]): void {
    let clients: string[] = [];

    if (usersId && usersId.length > 0) {
      for (const userId of usersId) {
        const clientIds = this.connectedClients.get(userId) || [];
        clients.push(...clientIds);
      }
    } else {
      clients = [...this.server.sockets.sockets.keys()];
    }

    if (clients.length > 0) {
      this.server.to(clients).emit(event, payload);
      this.logger.log(`Sent '${event}' to ${clients.length} client(s)`);
    }
  }

  sendToRoom(room: string, event: string, payload: any = null): void {
    this.server.to(room).emit(event, payload);
    this.logger.log(`Sent '${event}' to room ${room}`);
  }

  getConnectedClients(): Map<string, string[]> {
    return this.connectedClients;
  }

  private extractToken(client: Socket): string | undefined {
    const auth = client.handshake.auth as { token?: unknown };
    const tokenFromAuth = typeof auth.token === 'string' ? auth.token : undefined;
    const authHeader = client.handshake.headers.authorization;
    const tokenFromHeader =
      typeof authHeader === 'string' ? authHeader.split(' ')[1] : undefined;
    return tokenFromAuth ?? tokenFromHeader;
  }
}
