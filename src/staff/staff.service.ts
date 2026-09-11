import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { AuditService } from '../common/utils/audit.service';
import { AuthService } from '../auth/auth.service';
import { TransactionalEmailService } from '../notifications/transactional-email.service';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { AcceptStaffInvitationDto } from './dto/accept-staff-invitation.dto';
import { ListStaffDto } from './dto/list-staff.dto';
import { generateSecureToken, hashSecureToken } from '../common/utils/secure-token.util';
import { buildPaginatedResult, paginationSkip } from '../common/utils/paginate';
import { assertPasswordMeetsPolicy } from '../common/utils/password-policy.util';

const MANAGE_ROLES: OrgRole[] = ['OWNER', 'PROPERTY_MANAGER'];
const DEFAULT_EXPIRY_DAYS = 7;

const ROLE_LABELS: Record<OrgRole, string> = {
  OWNER: 'Owner',
  PROPERTY_MANAGER: 'Property Manager',
  ACCOUNTANT: 'Accountant',
  CARETAKER: 'Caretaker',
  STAFF: 'Staff',
};

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly audit: AuditService,
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    private readonly transactionalEmail: TransactionalEmailService,
  ) {}

  // ── Landlord-facing ─────────────────────────────────────────────────

  async listMembers(userId: string, organizationId: string, query: ListStaffDto) {
    await this.organizations.assertMembership(userId, organizationId);

    const where = {
      organizationId,
      ...(query.role ? { role: query.role } : {}),
    };

    const [dataFromDb, total] = await this.prisma.$transaction([
      this.prisma.organizationMember.findMany({
        where,
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
        orderBy: { joinedAt: 'asc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              avatarUrl: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.organizationMember.count({ where }),
    ]);

    const data = dataFromDb.map((m) => ({
      id: m.id,
      role: m.role,
      isActive: m.isActive,
      joinedAt: m.joinedAt,
      user: m.user,
    }));

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async listInvitations(userId: string, organizationId: string) {
    await this.organizations.assertMembership(userId, organizationId);

    const invitations = await this.prisma.staffInvitation.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });

    // Avoid returning tokenHash; it is a secret that must stay server-side.
    const soSafe = invitations.map(({ tokenHash: _tokenHash, ...rest }) => rest);
    return soSafe;
  }

  async invite(userId: string, organizationId: string, dto: InviteStaffDto) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!MANAGE_ROLES.includes(membership.role)) {
      throw new ForbiddenException('Only owners or property managers can invite staff');
    }

    const email = dto.email.toLowerCase();
    const isSelf = email === (await this.userEmail(userId));
    if (isSelf) {
      throw new BadRequestException('You are already a member of this organization');
    }

    const existingMember = await this.prisma.organizationMember.findFirst({
      where: { organizationId, user: { email } },
      include: { user: true },
    });
    if (existingMember) {
      throw new ConflictException('This person is already a member of the organization');
    }

    const existingPending = await this.prisma.staffInvitation.findFirst({
      where: { organizationId, email, status: 'PENDING' },
    });
    if (existingPending) {
      throw new ConflictException('A pending invitation already exists for this email');
    }

    const rawToken = generateSecureToken();
    const expiresInDays = dto.expiresInDays ?? DEFAULT_EXPIRY_DAYS;

    const invitation = await this.prisma.staffInvitation.create({
      data: {
        organizationId,
        email,
        role: dto.role,
        tokenHash: hashSecureToken(rawToken),
        invitedByUserId: userId,
        expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
      },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'STAFF_INVITATION_CREATED',
      entityType: 'StaffInvitation',
      entityId: invitation.id,
      newValue: { email, role: dto.role },
    });

    const frontendUrl = this.config.get<string>('frontendUrl');
    const invitationLink = `${frontendUrl}/staff-invitations/${rawToken}`;

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });

    // Best-effort delivery — TransactionalEmailService never throws, so a
    // broken SMTP config can't block invitation creation. The raw link is
    // also returned directly for local-dev fallback.
    await this.transactionalEmail.sendStaffInvitation(
      email,
      dto.fullName ?? '',
      organization?.name ?? 'your organization',
      ROLE_LABELS[dto.role],
      invitationLink,
    );

    return {
      invitation: { ...invitation, tokenHash: undefined },
      rawToken,
      invitationLink,
    };
  }

  async revoke(userId: string, organizationId: string, invitationId: string) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!MANAGE_ROLES.includes(membership.role)) {
      throw new ForbiddenException('Only owners or property managers can revoke invitations');
    }

    const invitation = await this.prisma.staffInvitation.findFirst({
      where: { id: invitationId, organizationId },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status !== 'PENDING') {
      throw new BadRequestException(`Cannot revoke an invitation with status ${invitation.status}`);
    }

    const updated = await this.prisma.staffInvitation.update({
      where: { id: invitationId },
      data: { status: 'REVOKED' },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'STAFF_INVITATION_REVOKED',
      entityType: 'StaffInvitation',
      entityId: invitationId,
    });

    const { tokenHash: _tokenHash, ...safe } = updated;
    return safe;
  }

  async updateRole(userId: string, organizationId: string, memberId: string, role: OrgRole) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!MANAGE_ROLES.includes(membership.role)) {
      throw new ForbiddenException('Only owners or property managers can update staff roles');
    }

    if (role === OrgRole.OWNER) {
      throw new BadRequestException('The OWNER role cannot be assigned through this endpoint');
    }

    const member = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
    });
    if (!member) throw new NotFoundException('Staff member not found');
    if (member.role === OrgRole.OWNER) {
      throw new BadRequestException('The owner role cannot be changed');
    }

    const updated = await this.prisma.organizationMember.update({
      where: { id: memberId },
      data: { role },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'STAFF_ROLE_UPDATED',
      entityType: 'OrganizationMember',
      entityId: memberId,
      previousValue: { role: member.role },
      newValue: { role: updated.role },
    });

    return updated;
  }

  async removeMember(userId: string, organizationId: string, memberId: string) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!MANAGE_ROLES.includes(membership.role)) {
      throw new ForbiddenException('Only owners or property managers can remove staff');
    }

    const member = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
    });
    if (!member) throw new NotFoundException('Staff member not found');
    if (member.role === OrgRole.OWNER) {
      throw new BadRequestException('The owner cannot be removed');
    }
    if (member.userId === userId) {
      throw new BadRequestException('You cannot remove yourself');
    }

    const removed = await this.prisma.organizationMember.update({
      where: { id: memberId },
      data: { isActive: false },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'STAFF_MEMBER_REMOVED',
      entityType: 'OrganizationMember',
      entityId: memberId,
      previousValue: { isActive: true },
      newValue: { isActive: false },
    });

    return removed;
  }

  // ── Public (no auth) ────────────────────────────────────────────────

  async previewByToken(rawToken: string) {
    const invitation = await this.loadValidInvitation(rawToken);

    const [organization] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: invitation.organizationId },
        select: { name: true },
      }),
    ]);

    return {
      organizationName: organization?.name,
      email: invitation.email,
      role: invitation.role,
      roleLabel: ROLE_LABELS[invitation.role],
      expiresAt: invitation.expiresAt,
    };
  }

  async accept(rawToken: string, dto: AcceptStaffInvitationDto) {
    const invitation = await this.loadValidInvitation(rawToken);

    // Resolve the (possibly new) user for the invited email.
    const existingUser = await this.prisma.user.findFirst({
      where: { email: invitation.email },
    });

    assertPasswordMeetsPolicy(dto.password);
    const passwordHash = await argon2.hash(dto.password);

    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.staffInvitation.updateMany({
        where: { id: invitation.id, status: 'PENDING' },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('This invitation has already been used');
      }

      let user = existingUser;
      if (!user) {
        user = await tx.user.create({
          data: {
            email: invitation.email,
            firstName: dto.firstName,
            lastName: dto.lastName,
            passwordHash,
            status: 'ACTIVE',
            // Accepting a targeted, expiring token is itself proof of email
            // control; mirror the tenant-invitation flow and trust it.
            emailVerifiedAt: new Date(),
          },
        });
      }

      const membership = await tx.organizationMember.upsert({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: user.id,
          },
        },
        update: { role: invitation.role, isActive: true },
        create: {
          organizationId: invitation.organizationId,
          userId: user.id,
          role: invitation.role,
          isActive: true,
          invitedAt: new Date(),
        },
      });

      return { user, membership };
    });

    await this.audit.log({
      organizationId: invitation.organizationId,
      actorUserId: result.user.id,
      action: 'STAFF_INVITATION_ACCEPTED',
      entityType: 'StaffInvitation',
      entityId: invitation.id,
      newValue: { userId: result.user.id, role: result.membership.role },
    });

    const tokens = await this.authService.issueTokenPair(
      result.user.id,
      result.user.email,
      invitation.organizationId,
    );

    return {
      message: 'Invitation accepted. Welcome!',
      user: { id: result.user.id, email: result.user.email, firstName: result.user.firstName, lastName: result.user.lastName },
      organizationRole: result.membership.role,
      ...tokens,
    };
  }

  private async loadValidInvitation(rawToken: string) {
    const tokenHash = hashSecureToken(rawToken);
    const invitation = await this.prisma.staffInvitation.findUnique({ where: { tokenHash } });

    if (!invitation) {
      throw new NotFoundException('Invalid invitation token');
    }
    if (invitation.status === 'ACCEPTED') {
      throw new ConflictException('This invitation has already been used');
    }
    if (invitation.status === 'REVOKED') {
      throw new GoneException('This invitation has been revoked');
    }
    if (invitation.status === 'EXPIRED' || invitation.expiresAt < new Date()) {
      if (invitation.status !== 'EXPIRED') {
        await this.prisma.staffInvitation.update({
          where: { id: invitation.id },
          data: { status: 'EXPIRED' },
        });
      }
      throw new GoneException('This invitation has expired');
    }

    return invitation;
  }

  private async userEmail(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    return user?.email ?? '';
  }
}
