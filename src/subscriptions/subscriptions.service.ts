import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrgRole, Prisma, SubscriptionPlanTier } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { AuditService } from '../common/utils/audit.service';
import { ChangePlanDto } from './dto/change-plan.dto';

const OWNER_ROLES: OrgRole[] = ['OWNER'];

type LimitResource = 'property' | 'unit' | 'tenant' | 'staff';
type FeatureKey = 'mpesa' | 'sms' | 'reports' | 'maintenance' | 'marketplace' | 'analytics';

/** Normalized effective-plan shape returned by getEffectiveLimits. */
export interface EffectiveLimits {
  tier: SubscriptionPlanTier;
  name: string;
  planId: string | null;
  priceMonthly: number;
  maxProperties: number | null;
  maxUnits: number | null;
  maxTenants: number | null;
  maxStaff: number | null;
  mpesaEnabled: boolean;
  smsEnabled: boolean;
  reportsEnabled: boolean;
  maintenanceEnabled: boolean;
  marketplaceEnabled: boolean;
  advancedAnalytics: boolean;
}

/**
 * Subscription lifecycle (spec §34–35). The Organization row already
 * carries subscriptionPlan/subscriptionStatus for quick reads; this
 * module adds the fuller record (Subscription, SubscriptionPayment) and
 * the plan-limit enforcement the other modules call into. Plans are
 * configurable rows, not hardcoded constants (spec §34: "the exact
 * pricing should be configurable rather than hardcoded").
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly audit: AuditService,
  ) {}

  async listPlans() {
    return this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: 'asc' },
    });
  }

  async ensureSubscriptionExists(tx: Prisma.TransactionClient, organizationId: string) {
    const existing = await tx.subscription.findUnique({ where: { organizationId } });
    if (existing) return existing;
    const org = await tx.organization.findUnique({ where: { id: organizationId } });
    if (!org) return null;

    return tx.subscription.create({
      data: {
        organizationId,
        tier: org.subscriptionPlan ?? 'FREE',
        status: org.subscriptionStatus ?? 'TRIAL',
        startDate: new Date(),
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  async getMySubscription(userId: string, organizationId: string) {
    await this.organizations.assertMembership(userId, organizationId);
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId },
      include: { plan: true, payments: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    if (!subscription)
      return { organizationId, tier: 'FREE', status: 'TRIAL', plan: null, payments: [] };
    return subscription;
  }

  async changePlan(userId: string, organizationId: string, dto: ChangePlanDto) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!OWNER_ROLES.includes(membership.role)) {
      throw new ForbiddenException('Only the organization owner can change the subscription plan');
    }

    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { tier: dto.tier } });
    if (!plan || !plan.isActive) throw new NotFoundException('Plan not found');

    const current = await this.ensureSubscriptionExists(this.prisma, organizationId);
    const before = current;
    const updated = await this.prisma.$transaction(async (tx) => {
      // Sync the flat Organization fields too, so FRONTEND reads that
      // still use them stay consistent with the dedicated row.
      await tx.organization.update({
        where: { id: organizationId },
        data: { subscriptionPlan: dto.tier },
      });

      const subscription = current
        ? await tx.subscription.update({
            where: { id: current.id },
            data: {
              tier: dto.tier,
              planId: plan.id,
              status: 'ACTIVE',
              startDate: current?.startDate ?? new Date(),
              nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          })
        : await tx.subscription.create({
            data: {
              organizationId,
              tier: dto.tier,
              planId: plan.id,
              status: 'ACTIVE',
              startDate: new Date(),
              nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          });

      await tx.organization.update({
        where: { id: organizationId },
        data: { subscriptionStatus: 'ACTIVE' },
      });
      return subscription;
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'SUBSCRIPTION_CHANGED',
      entityType: 'Subscription',
      entityId: updated.id,
      previousValue: before,
      newValue: updated,
    });

    return {
      ...updated,
      plan: { ...plan },
    };
  }

  // ── Plan-limit enforcement (spec §32–59) ──────────────────────────

  /** Returns the effective limits for an organization's current plan. */
  async getEffectiveLimits(organizationId: string): Promise<EffectiveLimits> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new NotFoundException('Organization not found');
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { tier: org.subscriptionPlan },
    });
    if (plan) {
      return {
        tier: plan.tier,
        name: plan.name,
        planId: plan.id,
        priceMonthly: Number(plan.priceMonthly),
        maxProperties: plan.maxProperties,
        maxUnits: plan.maxUnits,
        maxTenants: plan.maxTenants,
        maxStaff: plan.maxStaff,
        mpesaEnabled: plan.mpesaEnabled,
        smsEnabled: plan.smsEnabled,
        reportsEnabled: plan.reportsEnabled,
        maintenanceEnabled: plan.maintenanceEnabled,
        marketplaceEnabled: plan.marketplaceEnabled,
        advancedAnalytics: plan.advancedAnalytics,
      };
    }
    // Fallback if no SubscriptionPlan rows exist (e.g. seed not run): the
    // FREE defaults live here as a sane baseline rather than hardcoded
    // elsewhere (spec §34: pricing stays configurable, defaults don't).
    return {
      tier: 'FREE',
      name: 'Free',
      planId: null,
      priceMonthly: 0,
      maxProperties: 1,
      maxUnits: null,
      maxTenants: null,
      maxStaff: 3,
      mpesaEnabled: false,
      smsEnabled: false,
      reportsEnabled: false,
      maintenanceEnabled: false,
      marketplaceEnabled: false,
      advancedAnalytics: false,
    };
  }

  /**
   * Called before creating properties/units/tenants/staff. Throws a clear
   * business error if the plan's limit would be exceeded (spec §59:
   * "If a user exceeds a plan limit, the API should return a clear
   * business error"). A null limit means unlimited.
   */
  async assertCanCreate(organizationId: string, resource: LimitResource) {
    const plan = await this.getEffectiveLimits(organizationId);

    const countField =
      resource === 'property'
        ? 'maxProperties'
        : resource === 'unit'
          ? 'maxUnits'
          : resource === 'staff'
            ? 'maxStaff'
            : 'maxTenants';
    const limit = plan[countField] ?? null;
    if (limit === null) return; // unlimited on this plan

    const count =
      resource === 'property'
        ? await this.prisma.property.count({ where: { organizationId, deletedAt: null } })
        : resource === 'unit'
          ? await this.prisma.unit.count({
              where: { property: { organizationId }, deletedAt: null },
            })
          : resource === 'tenant'
            ? await this.prisma.tenantProfile.count({ where: { organizationId, deletedAt: null } })
            : await this.prisma.organizationMember.count({
                where: { organizationId, isActive: true },
              });

    if (count >= limit) {
      throw new ForbiddenException(
        `Your ${plan.name ?? plan.tier} plan allows up to ${limit} ${resource}(s). Please upgrade your subscription to add more.`,
      );
    }
  }

  async isFeatureEnabled(organizationId: string, feature: FeatureKey) {
    const plan = await this.getEffectiveLimits(organizationId);
    const fieldMap: Record<FeatureKey, keyof EffectiveLimits> = {
      mpesa: 'mpesaEnabled',
      sms: 'smsEnabled',
      reports: 'reportsEnabled',
      maintenance: 'maintenanceEnabled',
      marketplace: 'marketplaceEnabled',
      analytics: 'advancedAnalytics',
    };
    return Boolean(plan[fieldMap[feature]]);
  }
}
