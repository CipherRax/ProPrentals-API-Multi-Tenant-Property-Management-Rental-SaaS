import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { ChatGateway } from './chat.gateway';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { buildPaginatedResult, paginationSkip } from '../common/utils/paginate';
import { SendMessageDto } from './dto/send-message.dto';

const SENDER_SELECT = { id: true, firstName: true, lastName: true, email: true, avatarUrl: true };

@Injectable()
export class PeerConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly chatGateway: ChatGateway,
  ) {}

  async list(userId: string, organizationId: string, query: PaginationQueryDto) {
    await this.organizations.assertMembership(userId, organizationId);

    const where = {
      organizationId,
      OR: [{ participantOneId: userId }, { participantTwoId: userId }],
    };

    const [conversations, total] = await this.prisma.$transaction([
      this.prisma.peerConversation.findMany({
        where,
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          participantOne: { select: SENDER_SELECT },
          participantTwo: { select: SENDER_SELECT },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.peerConversation.count({ where }),
    ]);

    const ids = conversations.map((c) => c.id);
    const readStates = ids.length
      ? await this.prisma.peerConversationReadState.findMany({
          where: { userId, peerConversationId: { in: ids } },
        })
      : [];
    const readBy = new Map(readStates.map((r) => [r.peerConversationId, r.lastReadAt]));

    const data = await Promise.all(
      conversations.map(async (c) => {
        const peer = c.participantOneId === userId ? c.participantTwo : c.participantOne;
        const lastMessage = c.messages[0] ?? null;
        const unreadCount = await this.prisma.peerConversationMessage.count({
          where: {
            peerConversationId: c.id,
            senderUserId: { not: userId },
            createdAt: { gt: readBy.get(c.id) ?? new Date(0) },
          },
        });
        return {
          id: c.id,
          organizationId: c.organizationId,
          peer: {
            id: peer.id,
            name: `${peer.firstName} ${peer.lastName}`,
            email: peer.email,
            avatarUrl: peer.avatarUrl,
          },
          lastMessage: lastMessage?.body ?? null,
          unreadCount,
          updatedAt: c.updatedAt,
        };
      }),
    );

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async start(userId: string, organizationId: string, peerUserId: string) {
    await this.organizations.assertMembership(userId, organizationId);
    if (peerUserId === userId) {
      throw new ForbiddenException('You cannot start a conversation with yourself');
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: peerUserId } },
      select: { isActive: true },
    });
    if (!membership || !membership.isActive) {
      throw new NotFoundException('That person is not a member of this organization');
    }

    // Canonical ordering: the lexicographically smaller id is always stored
    // first, so (A,B) and (B,A) resolve to the same row.
    const [participantOneId, participantTwoId] =
      userId < peerUserId ? [userId, peerUserId] : [peerUserId, userId];

    const conversation = await this.prisma.peerConversation.upsert({
      where: {
        organizationId_participantOneId_participantTwoId: {
          organizationId,
          participantOneId,
          participantTwoId,
        },
      },
      update: {},
      create: { organizationId, participantOneId, participantTwoId },
      include: {
        participantOne: { select: SENDER_SELECT },
        participantTwo: { select: SENDER_SELECT },
      },
    });

    const peer =
      conversation.participantOneId === userId
        ? conversation.participantTwo
        : conversation.participantOne;
    return {
      id: conversation.id,
      organizationId: conversation.organizationId,
      peer: {
        id: peer.id,
        name: `${peer.firstName} ${peer.lastName}`,
        email: peer.email,
        avatarUrl: peer.avatarUrl,
      },
    };
  }

  async getMessages(
    userId: string,
    organizationId: string,
    peerConversationId: string,
    query: PaginationQueryDto,
  ) {
    const _conversation = await this.assertPeerParticipant(
      userId,
      organizationId,
      peerConversationId,
    );

    const where = { peerConversationId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.peerConversationMessage.findMany({
        where,
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { sender: { select: SENDER_SELECT } },
      }),
      this.prisma.peerConversationMessage.count({ where }),
    ]);

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async sendMessage(
    userId: string,
    organizationId: string,
    peerConversationId: string,
    dto: SendMessageDto,
  ) {
    await this.assertPeerParticipant(userId, organizationId, peerConversationId);

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.peerConversationMessage.create({
        data: {
          peerConversationId,
          senderUserId: userId,
          body: dto.body,
          attachmentUrl: dto.attachmentUrl,
        },
        include: { sender: { select: SENDER_SELECT } },
      });
      await tx.peerConversation.update({
        where: { id: peerConversationId },
        data: { updatedAt: new Date() },
      });
      await tx.peerConversationReadState.upsert({
        where: { peerConversationId_userId: { peerConversationId, userId } },
        update: { lastReadAt: created.createdAt },
        create: { peerConversationId, userId, lastReadAt: created.createdAt },
      });
      return created;
    });

    this.chatGateway.broadcastNewMessage(peerConversationId, message);
    return message;
  }

  async markRead(userId: string, organizationId: string, peerConversationId: string) {
    await this.assertPeerParticipant(userId, organizationId, peerConversationId);
    await this.prisma.peerConversationReadState.upsert({
      where: { peerConversationId_userId: { peerConversationId, userId } },
      update: { lastReadAt: new Date() },
      create: { peerConversationId, userId, lastReadAt: new Date() },
    });
    return { message: 'Marked as read' };
  }

  private async assertPeerParticipant(
    userId: string,
    organizationId: string,
    peerConversationId: string,
  ) {
    const conversation = await this.prisma.peerConversation.findFirst({
      where: { id: peerConversationId, organizationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found in this organization');
    if (conversation.participantOneId !== userId && conversation.participantTwoId !== userId) {
      throw new ForbiddenException('You are not a participant in this conversation');
    }
    return conversation;
  }
}
