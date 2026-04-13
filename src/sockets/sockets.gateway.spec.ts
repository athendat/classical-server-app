import { Test, TestingModule } from '@nestjs/testing';
import { SocketGateway } from './sockets.gateway';
import { Result } from 'src/common/types/result.type';

describe('SocketGateway', () => {
  let gateway: SocketGateway;
  let jwtTokenPort: { verify: jest.Mock };

  beforeEach(async () => {
    jwtTokenPort = { verify: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocketGateway,
        { provide: 'IJwtTokenPort', useValue: jwtTokenPort },
      ],
    }).compile();

    gateway = module.get<SocketGateway>(SocketGateway);
    gateway.server = { to: jest.fn(), sockets: { sockets: new Map() } } as any;
  });

  describe('handleConnection', () => {
    it('should disconnect client with no token', async () => {
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

    it('should disconnect client with invalid token', async () => {
      jwtTokenPort.verify.mockResolvedValue(Result.fail(new Error('invalid token')));

      const client = {
        id: 'c2',
        handshake: { auth: { token: 'bad-token' }, headers: {} },
        disconnect: jest.fn(),
        emit: jest.fn(),
      } as any;

      await gateway.handleConnection(client);

      expect(jwtTokenPort.verify).toHaveBeenCalledWith('bad-token');
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should accept valid token, emit connected, and track client by userId', async () => {
      jwtTokenPort.verify.mockResolvedValue(Result.ok({ sub: 'user-123' }));

      const client = {
        id: 'c3',
        handshake: { auth: { token: 'valid-token' }, headers: {} },
        disconnect: jest.fn(),
        emit: jest.fn(),
      } as any;

      await gateway.handleConnection(client);

      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith('connected', {
        message: 'Connected to socket gateway',
        clientId: 'c3',
      });
      expect(gateway.getConnectedClients().get('user-123')).toContain('c3');
    });
  });

  describe('handleDisconnect', () => {
    it('should remove client from tracking on disconnect', async () => {
      jwtTokenPort.verify.mockResolvedValue(Result.ok({ sub: 'user-456' }));

      const client = {
        id: 'c4',
        handshake: { auth: { token: 'token' }, headers: {} },
        disconnect: jest.fn(),
        emit: jest.fn(),
      } as any;

      await gateway.handleConnection(client);
      expect(gateway.getConnectedClients().get('user-456')).toContain('c4');

      gateway.handleDisconnect(client);
      expect(gateway.getConnectedClients().has('user-456')).toBe(false);
    });

    it('should keep other clients when one disconnects', async () => {
      jwtTokenPort.verify.mockResolvedValue(Result.ok({ sub: 'user-789' }));

      const client1 = { id: 'c5', handshake: { auth: { token: 't1' }, headers: {} }, disconnect: jest.fn(), emit: jest.fn() } as any;
      const client2 = { id: 'c6', handshake: { auth: { token: 't2' }, headers: {} }, disconnect: jest.fn(), emit: jest.fn() } as any;

      await gateway.handleConnection(client1);
      await gateway.handleConnection(client2);
      expect(gateway.getConnectedClients().get('user-789')).toEqual(['c5', 'c6']);

      gateway.handleDisconnect(client1);
      expect(gateway.getConnectedClients().get('user-789')).toEqual(['c6']);
    });
  });

  describe('sendMessage', () => {
    it('should emit to specific users by userId', async () => {
      jwtTokenPort.verify.mockResolvedValue(Result.ok({ sub: 'user-A' }));
      const mockTo = jest.fn().mockReturnValue({ emit: jest.fn() });
      gateway.server = { to: mockTo, sockets: { sockets: new Map() } } as any;

      const client = { id: 'cA', handshake: { auth: { token: 't' }, headers: {} }, disconnect: jest.fn(), emit: jest.fn() } as any;
      await gateway.handleConnection(client);

      gateway.sendMessage('test.event', { data: 1 }, ['user-A']);

      expect(mockTo).toHaveBeenCalledWith(['cA']);
      expect(mockTo('cA').emit).toHaveBeenCalledWith('test.event', { data: 1 });
    });

    it('should emit to all connected clients when no users specified', async () => {
      const mockEmit = jest.fn();
      const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
      const socketsMap = new Map([['s1', {}], ['s2', {}]]);
      gateway.server = { to: mockTo, sockets: { sockets: socketsMap } } as any;

      gateway.sendMessage('broadcast.event', { msg: 'hello' });

      expect(mockTo).toHaveBeenCalledWith(['s1', 's2']);
      expect(mockEmit).toHaveBeenCalledWith('broadcast.event', { msg: 'hello' });
    });

    it('should not emit when target users have no connected clients', () => {
      const mockTo = jest.fn();
      gateway.server = { to: mockTo, sockets: { sockets: new Map() } } as any;

      gateway.sendMessage('event', {}, ['nonexistent-user']);

      expect(mockTo).not.toHaveBeenCalled();
    });
  });

  describe('handleJoin', () => {
    it('should join room and confirm', () => {
      const client = { join: jest.fn(), emit: jest.fn() } as any;

      gateway.handleJoin(client, { room: 'intent-uuid-123' });

      expect(client.join).toHaveBeenCalledWith('intent-uuid-123');
      expect(client.emit).toHaveBeenCalledWith('joined', { room: 'intent-uuid-123' });
    });

    it('should emit error if room is empty', () => {
      const client = { join: jest.fn(), emit: jest.fn() } as any;

      gateway.handleJoin(client, { room: '   ' });

      expect(client.join).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith('error', { message: 'room is required' });
    });
  });

  describe('sendToRoom', () => {
    it('should emit event to a named room', () => {
      const mockEmit = jest.fn();
      const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
      gateway.server = { to: mockTo, sockets: { sockets: new Map() } } as any;

      gateway.sendToRoom('room-abc', 'payment.result', { status: 'success' });

      expect(mockTo).toHaveBeenCalledWith('room-abc');
      expect(mockEmit).toHaveBeenCalledWith('payment.result', { status: 'success' });
    });
  });
});
