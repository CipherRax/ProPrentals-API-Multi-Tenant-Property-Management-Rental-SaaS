import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { AuditService } from '../common/utils/audit.service';
import { CreateRentConfigurationDto } from './dto/create-rent-configuration.dto';

const MANAGE_ROLES: OrgRole[] = ['OWNER', 'PROPERTY_MANAGER'];

@Injectable()
export class RentConfigurationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly audit: AuditService,
  ) {}

  private async getOwnedTenancy(organizationId: string, tenancyId: string) {
    const tenancy = await this.prisma.tenancy.findFirst({
      where: { id: tenancyId, organizationId },
    });
    if (!tenancy) throw new NotFoundException('Tenancy not found');
    return tenancy;
  }

  /**
   * Rent changes never overwrite the previous amount (spec §13). Creating
   * a new configuration closes the current one's effectiveTo at the new
   * config's effectiveFrom and inserts a fresh row — both happen in one
   * transaction so there's never a moment with zero or two "current"
   * configurations for a tenancy.
   */
  async create(
    userId: string,
    organizationId: string,
    tenancyId: string,
    dto: CreateRentConfigurationDto,
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!MANAGE_ROLES.includes(membership.role)) {
      throw new ForbiddenException(
        'Only owners or property managers can change rent configuration',
      );
    }

    const tenancy = await this.getOwnedTenancy(organizationId, tenancyId);
    const effectiveFrom = new Date(dto.effectiveFrom);

    const current = await this.prisma.rentConfiguration.findFirst({
      where: { tenancyId, effectiveTo: null },
    });

    if (current && effectiveFrom <= current.effectiveFrom) {
      throw new BadRequestException(
        'New rent configuration must take effect after the current configuration started',
      );
    }

    const config = await this.prisma.$transaction(async (tx) => {
      if (current) {
        await tx.rentConfiguration.update({
          where: { id: current.id },
          data: { effectiveTo: effectiveFrom },
        });
      }

      return tx.rentConfiguration.create({
        data: {
          tenancyId,
          organizationId,
          unitId: tenancy.unitId,
          amount: dto.amount,
          billingFrequency: dto.billingFrequency ?? tenancy.billingFrequency,
          paymentDueDay: dto.paymentDueDay ?? tenancy.paymentDueDay,
          gracePeriodDays: dto.gracePeriodDays ?? 0,
          lateFeeAmount: dto.lateFeeAmount,
          lateFeeIsPercentage: dto.lateFeeIsPercentage ?? false,
          effectiveFrom,
          notes: dto.notes,
          createdByUserId: userId,
        },
      });
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'RENT_CONFIGURATION_CREATED',
      entityType: 'RentConfiguration',
      entityId: config.id,
      previousValue: current,
      newValue: config,
    });

    return config;
  }

  async listForTenancy(userId: string, organizationId: string, tenancyId: string) {
    await this.organizations.assertMembership(userId, organizationId);
    await this.getOwnedTenancy(organizationId, tenancyId);

    return this.prisma.rentConfiguration.findMany({
      where: { tenancyId },
      orderBy: { effectiveFrom: 'asc' },
    });
  }

  // Used internally by the rent-generation job — resolves "what rent
  // applies right now" for a tenancy rather than assuming the most
  // recently created row is correct (effectiveFrom could theoretically
  // be backdated or postdated relative to insertion order).
  async getCurrentConfig(tenancyId: string, asOf: Date = new Date()) {
    return this.prisma.rentConfiguration.findFirst({
      where: {
        tenancyId,
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  }
}
