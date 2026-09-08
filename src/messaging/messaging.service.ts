import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatGateway } from './chat.gateway';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { buildPaginatedResult, paginationSkip } from '../common/utils/paginate';
import { SendMessageDto } from './dto/send-message.dto';

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly notifications: NotificationsService,
    private readonly chatGateway: ChatGateway,
  ) {}

  // ── Landlord/staff-facing ────────────────────────────────────────────

  async startOrGetConversation(userId: string, organizationId: string, tenantProfileId: string) {
    await this.organizations.assertMembership(userId, organizationId);

    const tenantProfile = await this.prisma.tenantProfile.findFirst({
      where: { id: tenantProfileId, organizationId, deletedAt: null },
    });
    if (!tenantProfile || !tenantProfile.userId) {
      throw new NotFoundException('Tenant not found, or has not activated their account yet');
    }

    return this.prisma.conversation.upsert({
      where: {
        organizationId_tenantUserId: { organizationId, tenantUserId: tenantProfile.userId },
      },
      update: {},
      create: { organizationId, tenantUserId: tenantProfile.userId },
    });
  }

  async listForOrg(userId: string, organizationId: string, query: PaginationQueryDto) {
    await this.organizations.assertMembership(userId, organizationId);

    const where = { organizationId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          tenantUser: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  // ── Tenant-facing ───────────────────────────────────────────────────

  async startOrGetMyConversation(userId: string, organizationId: string) {
    const tenantProfile = await this.prisma.tenantProfile.findFirst({
      where: { organizationId, userId, deletedAt: null },
    });
    if (!tenantProfile) {
      throw new NotFoundException('You are not a tenant of this organization');
    }

    return this.prisma.conversation.upsert({
      where: { organizationId_tenantUserId: { organizationId, tenantUserId: userId } },
      update: {},
      create: { organizationId, tenantUserId: userId },
    });
  }

  async listForTenant(userId: string) {
    return this.prisma.conversation.findMany({
      where: { tenantUserId: userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        organization: { select: { id: true, name: true, logoUrl: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
  }

  // ── Shared: messages, authorization, read state ─────────────────────

  /**
   * The authorization boundary for every message read/write: either the
   * caller IS the tenant on this conversation, or the caller is a
   * verified member of the organization that owns it. Never trust a
   * conversationId alone — always re-check against who's asking.
   */
  private async assertParticipant(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    if (conversation.tenantUserId === userId) return conversation;

    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: conversation.organizationId, userId } },
    });
    if (!membership || !membership.isActive) {
      throw new ForbiddenException('You are not a participant in this conversation');
    }
    return conversation;
  }

  /**
   * Used by the org-scoped controller (which has :organizationId in its
   * URL) — on top of the participant check above, also confirms the
   * conversation genuinely belongs to the organization named in the
   * URL, so that path segment is a real scoping constraint rather than
   * a decorative one. A user hitting a real conversationId under the
   * wrong organizationId gets 404, matching the pattern used by every
   * other org-scoped resource in this API (properties, units, etc.).
   */
  private async assertOrgParticipant(
    userId: string,
    organizationId: string,
    conversationId: string,
  ) {
    const conversation = await this.assertParticipant(userId, conversationId);
    if (conversation.organizationId !== organizationId) {
      throw new NotFoundException('Conversation not found in this organization');
    }
    return conversation;
  }

  /**
   * Pagination is mandatory here on purpose (spec §25: "do not load an
   * entire conversation history at once"). Ordered newest-first, same
   * convention as every other list endpoint in this API — a chat UI
   * reverses this page for display and requests the next page by
   * incrementing `page` to load older messages ("infinite scroll up").
   */
  async getMessages(
    userId: string,
    conversationId: string,
    query: PaginationQueryDto,
    organizationId?: string,
  ) {
    if (organizationId) {
      await this.assertOrgParticipant(userId, organizationId, conversationId);
    } else {
      await this.assertParticipant(userId, conversationId);
    }

    const where = { conversationId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.message.findMany({
        where,
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.message.count({ where }),
    ]);

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
    organizationId?: string,
  ) {
    const conversation = organizationId
      ? await this.assertOrgParticipant(userId, organizationId, conversationId)
      : await this.assertParticipant(userId, conversationId);

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId,
          senderUserId: userId,
          body: dto.body,
          attachmentUrl: dto.attachmentUrl,
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      // Sending your own message counts as having read up to it.
      await tx.conversationReadState.upsert({
        where: { conversationId_userId: { conversationId, userId } },
        update: { lastReadAt: created.createdAt },
        create: { conversationId, userId, lastReadAt: created.createdAt },
      });
      return created;
    });

    // Real-time push to anyone currently connected to this conversation
    // — purely additive; REST remains the source of truth regardless of
    // whether anyone is connected to receive the broadcast.
    this.chatGateway.broadcastNewMessage(conversationId, message);

    // Post-commit, best-effort notification to the OTHER side. Since a
    // conversation can have many possible staff recipients (any org
    // member), we only notify the tenant when staff sends, and — for
    // simplicity in this phase — notify the org owner when the tenant
    // sends. Notifying every staff member is a reasonable future
    // enhancement once staff notification preferences are more granular.
    await this.notifyNewMessage(conversation, userId, dto.body);

    return message;
  }

  private async notifyNewMessage(
    conversation: { id: string; organizationId: string; tenantUserId: string },
    senderUserId: string,
    body: string,
  ) {
    const isTenantSending = senderUserId === conversation.tenantUserId;

    if (isTenantSending) {
      const owner = await this.prisma.organizationMember.findFirst({
        where: { organizationId: conversation.organizationId, role: 'OWNER', isActive: true },
        include: { user: { select: { id: true, email: true, phone: true } } },
      });
      if (!owner) return;
      await this.notifications.dispatch({
        recipientUserId: owner.userId,
        organizationId: conversation.organizationId,
        type: 'NEW_MESSAGE',
        title: 'New tenant message',
        body: body.slice(0, 200),
        data: { conversationId: conversation.id },
        email: owner.user.email,
        phone: owner.user.phone ?? undefined,
      });
    } else {
      const tenant = await this.prisma.user.findUnique({
        where: { id: conversation.tenantUserId },
        select: { email: true, phone: true },
      });
      await this.notifications.dispatch({
        recipientUserId: conversation.tenantUserId,
        organizationId: conversation.organizationId,
        type: 'NEW_MESSAGE',
        title: 'New message from your landlord',
        body: body.slice(0, 200),
        data: { conversationId: conversation.id },
        email: tenant?.email,
        phone: tenant?.phone ?? undefined,
      });
    }
  }

  async markRead(userId: string, conversationId: string, organizationId?: string) {
    if (organizationId) {
      await this.assertOrgParticipant(userId, organizationId, conversationId);
    } else {
      await this.assertParticipant(userId, conversationId);
    }
    await this.prisma.conversationReadState.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      update: { lastReadAt: new Date() },
      create: { conversationId, userId, lastReadAt: new Date() },
    });
    this.chatGateway.broadcastRead(conversationId, userId);
    return { message: 'Marked as read' };
  }

  async getUnreadCount(userId: string, conversationId: string, organizationId?: string) {
    if (organizationId) {
      await this.assertOrgParticipant(userId, organizationId, conversationId);
    } else {
      await this.assertParticipant(userId, conversationId);
    }
    const readState = await this.prisma.conversationReadState.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    return this.prisma.message.count({
      where: {
        conversationId,
        senderUserId: { not: userId },
        createdAt: { gt: readState?.lastReadAt ?? new Date(0) },
      },
    });
  }
}
