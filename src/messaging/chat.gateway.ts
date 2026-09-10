import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../database/prisma.service';
import { PresenceService } from './presence.service';

interface AuthenticatedSocket extends Socket {
  data: { userId: string };
}

/**
 * Real-time layer ONLY — REST endpoints (MessagingController) are the
 * source of truth for persistence. This gateway broadcasts already-
 * persisted messages to connected sockets and tracks presence; it
 * deliberately does not implement its own separate persistence path,
 * which would risk the two diverging. This split also keeps the whole
 * message-send/read flow testable over plain HTTP without needing a
 * socket.io client in the test suite.
 */
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/chat' })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.query?.token;
      if (!token || typeof token !== 'string') throw new UnauthorizedException();

      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      client.data = { userId: payload.sub };

      // Join a room per conversation the user participates in, so
      // broadcasts can target `conversation:{id}` without the gateway
      // needing to track membership itself — Postgres already knows.
      const conversations = await this.prisma.conversation.findMany({
        where: {
          OR: [
            { tenantUserId: payload.sub },
            { organization: { members: { some: { userId: payload.sub, isActive: true } } } },
          ],
        },
        select: { id: true, organizationId: true, tenantUserId: true },
      });
      for (const conversation of conversations) {
        client.join(`conversation:${conversation.id}`);
      }

      // Same for staff-to-staff direct messages.
      const peerConversations = await this.prisma.peerConversation.findMany({
        where: {
          organization: { members: { some: { userId: payload.sub, isActive: true } } },
          OR: [{ participantOneId: payload.sub }, { participantTwoId: payload.sub }],
        },
        select: { id: true },
      });
      for (const peer of peerConversations) {
        client.join(`peer-conversation:${peer.id}`);
      }

      const wasOffline = !this.presence.isOnline(payload.sub);
      this.presence.addConnection(payload.sub, client.id);

      if (wasOffline) {
        for (const conversation of conversations) {
          client
            .to(`conversation:${conversation.id}`)
            .emit('presence:online', { userId: payload.sub });
        }
      }
      if (wasOffline) {
        for (const peer of peerConversations) {
          client
            .to(`peer-conversation:${peer.id}`)
            .emit('presence:online', { userId: payload.sub });
        }
      }
    } catch {
      this.logger.warn(`Rejected unauthenticated socket connection: ${client.id}`);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.data?.userId;
    if (!userId) return;

    const wentOffline = this.presence.removeConnection(userId, client.id);
    if (wentOffline) {
      const conversations = await this.prisma.conversation.findMany({
        where: {
          OR: [
            { tenantUserId: userId },
            { organization: { members: { some: { userId, isActive: true } } } },
          ],
        },
        select: { id: true },
      });
      for (const conversation of conversations) {
        this.server.to(`conversation:${conversation.id}`).emit('presence:offline', { userId });
      }
      const peerConversations = await this.prisma.peerConversation.findMany({
        where: {
          organization: { members: { some: { userId, isActive: true } } },
          OR: [{ participantOneId: userId }, { participantTwoId: userId }],
        },
        select: { id: true },
      });
      for (const peer of peerConversations) {
        this.server.to(`peer-conversation:${peer.id}`).emit('presence:offline', { userId });
      }
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.to(`conversation:${data.conversationId}`).emit('typing', { userId: client.data.userId });
  }

  /**
   * Called by MessagingService AFTER a message is persisted via REST —
   * this is the one method application code calls directly; everything
   * else in this class only reacts to socket.io lifecycle events.
   */
  broadcastNewMessage(conversationId: string, message: unknown) {
    this.server.to(`conversation:${conversationId}`).emit('message:new', message);
    this.server.to(`peer-conversation:${conversationId}`).emit('message:new', message);
  }

  broadcastRead(conversationId: string, userId: string) {
    this.server
      .to(`conversation:${conversationId}`)
      .emit('message:read', { userId, readAt: new Date() });
    this.server
      .to(`peer-conversation:${conversationId}`)
      .emit('message:read', { userId, readAt: new Date() });
  }

  isOnline(userId: string): boolean {
    return this.presence.isOnline(userId);
  }
}
