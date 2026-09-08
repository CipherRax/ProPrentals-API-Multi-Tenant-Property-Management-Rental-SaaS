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
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { AuditService } from '../common/utils/audit.service';
import { AuthService } from '../auth/auth.service';
import { TenanciesService } from '../tenancies/tenancies.service';
import { TransactionalEmailService } from '../notifications/transactional-email.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { QueryInvitationsDto } from './dto/query-invitations.dto';
import { generateSecureToken, hashSecureToken } from '../common/utils/secure-token.util';
import { buildPaginatedResult, paginationSkip } from '../common/utils/paginate';

const MANAGE_ROLES: OrgRole[] = ['OWNER', 'PROPERTY_MANAGER'];
const DEFAULT_EXPIRY_DAYS = 7;

@Injectable()
export class TenantInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly audit: AuditService,
    private readonly authService: AuthService,
    private readonly tenanciesService: TenanciesService,
    private readonly config: ConfigService,
    private readonly transactionalEmail: TransactionalEmailService,
  ) {}

  // ── Landlord-facing ─────────────────────────────────────────────────

  async create(userId: string, organizationId: string, dto: CreateInvitationDto) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!MANAGE_ROLES.includes(membership.role)) {
      throw new ForbiddenException('Only owners or property managers can invite tenants');
    }

    const unit = await this.prisma.unit.findFirst({
      where: { id: dto.unitId, propertyId: dto.propertyId, deletedAt: null },
      include: { property: true },
    });
    if (!unit || unit.property.organizationId !== organizationId) {
      throw new NotFoundException('Unit not found in this organization/property');
    }

    const conflicting = await this.prisma.tenancy.findFirst({
      where: { unitId: dto.unitId, status: { in: ['ACTIVE', 'PENDING'] } },
    });
    if (conflicting) {
      throw new ConflictException('This unit already has an active or pending tenancy');
    }

    const rawToken = generateSecureToken();
    const expiresInDays = dto.expiresInDays ?? DEFAULT_EXPIRY_DAYS;

    const invitation = await this.prisma.tenantInvitation.create({
      data: {
        organizationId,
        propertyId: dto.propertyId,
        unitId: dto.unitId,
        tenantFullName: dto.tenantFullName,
        email: dto.email.toLowerCase(),
        phone: dto.phone,
        proposedRentAmount: dto.proposedRentAmount,
        proposedDepositAmount: dto.proposedDepositAmount,
        proposedStartDate: dto.proposedStartDate ? new Date(dto.proposedStartDate) : new Date(),
        billingFrequency: dto.billingFrequency ?? 'MONTHLY',
        paymentDueDay: dto.paymentDueDay ?? 5,
        tokenHash: hashSecureToken(rawToken),
        invitedByUserId: userId,
        expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
      },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'TENANT_INVITATION_CREATED',
      entityType: 'TenantInvitation',
      entityId: invitation.id,
      newValue: { email: invitation.email, unitId: invitation.unitId },
    });

    const frontendUrl = this.config.get<string>('frontendUrl');
    const invitationLink = `${frontendUrl}/tenant-invitations/${rawToken}`;

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });

    // Best-effort delivery — TransactionalEmailService logs failures
    // internally and never throws, so a broken SMTP/SMS config can't
    // block invitation creation. The raw token/link is ALSO still
    // returned directly to the inviter below: useful as a fallback if
    // delivery fails, and necessary for local dev without real SMTP/SMS
    // credentials configured.
    await this.transactionalEmail.sendTenantInvitation(
      invitation.email,
      invitation.phone,
      invitation.tenantFullName,
      organization?.name ?? 'your landlord',
      invitationLink,
    );

    return {
      invitation: { ...invitation, tokenHash: undefined },
      rawToken,
      invitationLink,
    };
  }

  async findAll(userId: string, organizationId: string, query: QueryInvitationsDto) {
    await this.organizations.assertMembership(userId, organizationId);

    const where = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [dataRaw, total] = await this.prisma.$transaction([
      this.prisma.tenantInvitation.findMany({
        where,
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
        orderBy: { createdAt: query.sortOrder },
        include: { unit: { select: { unitNumber: true } }, property: { select: { name: true } } },
      }),
      this.prisma.tenantInvitation.count({ where }),
    ]);

    // Never return tokenHash, even internally scoped to the org.
    const data = dataRaw.map(({ tokenHash: _tokenHash, ...rest }) => rest);
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async revoke(userId: string, organizationId: string, invitationId: string) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!MANAGE_ROLES.includes(membership.role)) {
      throw new ForbiddenException('Only owners or property managers can revoke invitations');
    }

    const invitation = await this.prisma.tenantInvitation.findFirst({
      where: { id: invitationId, organizationId },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status !== 'PENDING') {
      throw new BadRequestException(`Cannot revoke an invitation with status ${invitation.status}`);
    }

    const updated = await this.prisma.tenantInvitation.update({
      where: { id: invitationId },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'TENANT_INVITATION_REVOKED',
      entityType: 'TenantInvitation',
      entityId: invitationId,
    });

    const { tokenHash: _tokenHash, ...safe } = updated;
    return safe;
  }

  // ── Public (no auth) ────────────────────────────────────────────────

  async previewByToken(rawToken: string) {
    const invitation = await this.loadValidInvitation(rawToken);

    // Deliberately minimal — no internal IDs, no organization contact
    // details, nothing beyond what's needed to decide whether to accept
    // (spec §11: never expose internal identifiers unnecessarily).
    const [property, unit, organization] = await Promise.all([
      this.prisma.property.findUnique({
        where: { id: invitation.propertyId },
        select: { name: true, city: true, county: true },
      }),
      this.prisma.unit.findUnique({
        where: { id: invitation.unitId },
        select: { unitNumber: true, unitType: true, bedrooms: true, bathrooms: true },
      }),
      this.prisma.organization.findUnique({
        where: { id: invitation.organizationId },
        select: { name: true },
      }),
    ]);

    return {
      organizationName: organization?.name,
      property,
      unit,
      tenantFullName: invitation.tenantFullName,
      proposedRentAmount: invitation.proposedRentAmount,
      proposedDepositAmount: invitation.proposedDepositAmount,
      proposedStartDate: invitation.proposedStartDate,
      billingFrequency: invitation.billingFrequency,
      expiresAt: invitation.expiresAt,
    };
  }

  async accept(rawToken: string, dto: AcceptInvitationDto) {
    // Atomic single-use claim: flips PENDING -> we re-check status inside
    // the transaction below and only ever act once, but this initial
    // lookup also lets us fail fast with a clear error before opening a
    // transaction for the (more expensive) user/tenancy creation.
    const invitation = await this.loadValidInvitation(rawToken);

    // Plan-limit check: on-boarding a tenant creates a TenantProfile row,
    // which counts against the organization's maxTenants (spec §59).
    await this.subscriptions.assertCanCreate(invitation.organizationId, 'tenant');

    const existingUser = await this.prisma.user.findFirst({
      where: { email: invitation.email },
    });

    // SECURITY: if an account already exists for this email, we link the
    // tenant profile to it but deliberately do NOT issue a session here.
    // Otherwise, anyone able to generate an invitation (any OWNER/PM in
    // any organization) could target an arbitrary existing user's email
    // and use the returned token to obtain a logged-in session as that
    // user — since in this phase the raw token is returned directly to
    // the inviter rather than delivered out-of-band by the platform.
    if (existingUser) {
      const result = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.tenantInvitation.updateMany({
          where: { id: invitation.id, status: 'PENDING' },
          data: { status: 'ACCEPTED', acceptedAt: new Date() },
        });
        if (claimed.count !== 1) {
          throw new ConflictException('This invitation has already been used');
        }

        const tenantProfile = await tx.tenantProfile.upsert({
          where: {
            organizationId_userId: {
              organizationId: invitation.organizationId,
              userId: existingUser.id,
            },
          },
          update: { status: 'ACTIVE' },
          create: {
            organizationId: invitation.organizationId,
            userId: existingUser.id,
            fullName: invitation.tenantFullName,
            email: invitation.email,
            phone: invitation.phone,
            status: 'ACTIVE',
          },
        });

        const tenancy = await this.tenanciesService.createTenancyWithinTransaction(
          tx,
          invitation.organizationId,
          {
            unitId: invitation.unitId,
            tenantProfileId: tenantProfile.id,
            startDate: invitation.proposedStartDate ?? new Date(),
            rentAmount: Number(invitation.proposedRentAmount),
            depositAmount: Number(invitation.proposedDepositAmount),
            paymentDueDay: invitation.paymentDueDay,
            billingFrequency: invitation.billingFrequency,
          },
        );

        return { tenantProfile, tenancy };
      });

      await this.audit.log({
        organizationId: invitation.organizationId,
        actorUserId: existingUser.id,
        action: 'TENANT_INVITATION_ACCEPTED',
        entityType: 'TenantInvitation',
        entityId: invitation.id,
      });

      return {
        message:
          'Invitation accepted. An account already exists for this email — please log in to access your tenant dashboard.',
        tenancyId: result.tenancy.id,
        requiresLogin: true,
      };
    }

    // No existing account: this endpoint is the tenant's first contact
    // with the platform, so a password is required and a session is
    // issued immediately on success.
    if (!dto.password) {
      throw new BadRequestException('A password is required to activate a new account');
    }
    const passwordHash = await argon2.hash(dto.password);
    const [firstName, ...rest] = invitation.tenantFullName.trim().split(' ');
    const lastName = rest.join(' ') || firstName;

    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.tenantInvitation.updateMany({
        where: { id: invitation.id, status: 'PENDING' },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('This invitation has already been used');
      }

      const user = await tx.user.create({
        data: {
          email: invitation.email,
          phone: invitation.phone,
          firstName,
          lastName,
          passwordHash,
          status: 'ACTIVE',
          emailVerifiedAt: new Date(), // accepting a targeted, expiring token is itself a proof of email access in this flow
        },
      });

      const tenantProfile = await tx.tenantProfile.create({
        data: {
          organizationId: invitation.organizationId,
          userId: user.id,
          fullName: invitation.tenantFullName,
          email: invitation.email,
          phone: invitation.phone,
          status: 'ACTIVE',
        },
      });

      const tenancy = await this.tenanciesService.createTenancyWithinTransaction(
        tx,
        invitation.organizationId,
        {
          unitId: invitation.unitId,
          tenantProfileId: tenantProfile.id,
          startDate: invitation.proposedStartDate ?? new Date(),
          rentAmount: Number(invitation.proposedRentAmount),
          depositAmount: Number(invitation.proposedDepositAmount),
          paymentDueDay: invitation.paymentDueDay,
          billingFrequency: invitation.billingFrequency,
        },
      );

      return { user, tenantProfile, tenancy };
    });

    await this.audit.log({
      organizationId: invitation.organizationId,
      actorUserId: result.user.id,
      action: 'TENANT_INVITATION_ACCEPTED',
      entityType: 'TenantInvitation',
      entityId: invitation.id,
      newValue: { userId: result.user.id, tenancyId: result.tenancy.id },
    });

    const tokens = await this.authService.issueTokenPair(result.user.id, result.user.email);

    return {
      message: 'Invitation accepted. Welcome!',
      user: { id: result.user.id, email: result.user.email },
      tenancyId: result.tenancy.id,
      ...tokens,
    };
  }

  // Loads an invitation by raw token, validating status/expiry, and
  // opportunistically flips a stale PENDING invitation to EXPIRED so
  // list views stay accurate without needing a cron job for this alone.
  private async loadValidInvitation(rawToken: string) {
    const tokenHash = hashSecureToken(rawToken);
    const invitation = await this.prisma.tenantInvitation.findUnique({ where: { tokenHash } });

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
        await this.prisma.tenantInvitation.update({
          where: { id: invitation.id },
          data: { status: 'EXPIRED' },
        });
      }
      throw new GoneException('This invitation has expired');
    }

    return invitation;
  }
}
