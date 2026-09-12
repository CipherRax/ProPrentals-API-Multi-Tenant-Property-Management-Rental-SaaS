import { Injectable, NotFoundException } from '@nestjs/common';
import { InquiryStatus, OrgRole, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { GetAnalyticsQueryDto } from './dto/get-analytics-query.dto';

const ALLOWED_ROLES: OrgRole[] = ['OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT'];
const DAY_MS = 24 * 60 * 60 * 1000;

export type AnalyticsScope = 'portfolio' | 'property' | 'unitType';

export interface ScopeLabel {
  kind: AnalyticsScope;
  propertyId?: string;
  propertyName?: string;
  unitTypeId?: string;
  unitTypeName?: string;
}

export interface TrendPoint {
  period: string;
  value: number;
}

export interface PaymentTrendPoint {
  period: string;
  expectedRent: number;
  collectedRent: number;
  onTimePaymentRate: number | null;
}

export interface UnitTypeMetrics {
  key: string; // `<propertyId>:<unitTypeId>` stable drill-down anchor
  propertyId: string;
  propertyName: string;
  unitTypeId: string | null;
  unitTypeName: string;
  unitTypeKind: string;
  baseRent: number;
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  occupancyRate: number | null;
  avgDaysToFill: number | null;
  currentVacantAvgDays: number | null;
  expectedRent30: number;
  collectedRent30: number;
  collectionRate: number | null;
  onTimePaymentRate30: number | null;
  onTimePaymentRate90: number | null;
  inquiries30: number;
  inquiriesConverted: number;
  conversionRate30: number | null;
}

export interface AnalyticsBundle {
  scope: ScopeLabel;
  currency: 'KES';
  viewsUnavailable: true;
  metrics: {
    occupancyRate: number | null;
    occupiedUnits: number;
    totalUnits: number;
    vacantUnits: number;
    maintenanceUnits: number;
    avgDaysToFill: number | null;
    currentVacantAvgDays: number | null;
    onTimePaymentRate: number | null;
    avgDaysLate: number | null;
    expectedRent: number;
    collectedRent: number;
    /** Successful payments confirmed in the last 30 days. */
    collectedThisPeriod: number;
    outstandingRent: number;
    overdueRent: number;
    collectionRate: number | null;
    inquiriesTotal: number;
    inquiriesConverted: number;
    conversionRate: number | null;
    viewsUnavailable: true;
  };
  trends: {
    occupancyTrend30: TrendPoint[];
    occupancyTrend90: TrendPoint[];
    occupancyTrend365: TrendPoint[];
    paymentTrend30: PaymentTrendPoint[];
    paymentTrend90: PaymentTrendPoint[];
    paymentTrend365: PaymentTrendPoint[];
  };
  byMethod30: Array<{ method: string; amount: number }>;
  unitTypes: UnitTypeMetrics[];
  comparisons: {
    area: {
      sampleCount: number | null;
      avgRent: number | null;
      yourAvgRent: number | null;
      deltaPct: number | null;
      unitTypeLabel: string;
    } | null;
  };
}

interface ResolvedScopeParam {
  label: ScopeLabel;
  kind: AnalyticsScope;
  propertyIds: string[];
  unitTypeIds: string[];
}

interface ScopedUnit {
  id: string;
  propertyId: string;
  unitTypeId: string | null;
  availabilityStatus: string;
  createdAt: Date;
  tenancies: Array<{ status: string; startDate: Date | null; endDate: Date | null }>;
}

interface ScopedCharge {
  amount: Prisma.Decimal | number;
  amountPaid: Prisma.Decimal | number;
  dueDate: Date;
  billingPeriodEnd: Date;
  status: string;
  unit: { propertyId: string; unitTypeId: string | null } | null;
  paymentAllocations: Array<{ payment: { confirmedAt: Date | null; status: string } }>;
}

/**
 * Part A1 — underlying analytics layer that feeds both the dashboard charts
 * and the AI insights. Every query is scoped to a single organization at
 * the boundary (reusing the platform's membership + plan gating), so no
 * downstream consumer can ever observe another landlord's data. View counts
 * are not yet recorded by the marketplace — we flag viewsUnavailable rather
 * than fabricate numbers.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  private async assertAccess(userId: string, organizationId: string) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!ALLOWED_ROLES.includes(membership.role)) {
      throw new NotFoundException('Analytics not found');
    }
    if (!(await this.subscriptions.isFeatureEnabled(organizationId, 'analytics'))) {
      throw new NotFoundException('Analytics not found');
    }
  }

  async getAnalytics(userId: string, organizationId: string, query: GetAnalyticsQueryDto) {
    await this.assertAccess(userId, organizationId);

    const scope = await this.resolveScope(organizationId, query);
    const since365 = new Date(Date.now() - 365 * DAY_MS);
    const since30 = new Date(Date.now() - 30 * DAY_MS);

    // ── Portfolio-wide raw data (single source, filtered per scope) ──
    const [unitTypeDefs, units, chargesAll, inquiriesAll, payments30] = await Promise.all([
      this.prisma.unitTypeDefinition.findMany({
        where: { property: { organizationId, deletedAt: null }, deletedAt: null },
        select: {
          id: true,
          typeName: true,
          baseRent: true,
          unitType: true,
          totalCount: true,
          vacantCount: true,
          propertyId: true,
          property: { select: { name: true, county: true } },
        },
      }),
      this.prisma.unit.findMany({
        where: { property: { organizationId, deletedAt: null }, deletedAt: null },
        select: {
          id: true,
          propertyId: true,
          unitTypeId: true,
          availabilityStatus: true,
          createdAt: true,
          tenancies: {
            where: { status: { in: ['ACTIVE', 'EXPIRED'] } },
            select: { status: true, startDate: true, endDate: true },
          },
        },
      }),
      this.prisma.rentCharge.findMany({
        where: {
          organizationId,
          billingPeriodEnd: { gte: since365 },
          status: { notIn: ['CANCELLED', 'WAIVED'] },
        },
        select: {
          amount: true,
          amountPaid: true,
          dueDate: true,
          billingPeriodEnd: true,
          status: true,
          unit: { select: { propertyId: true, unitTypeId: true } },
          paymentAllocations: {
            select: { payment: { select: { confirmedAt: true, status: true } } },
          },
        },
      }),
      this.prisma.propertyInquiry.findMany({
        where: { organizationId },
        select: { id: true, status: true, propertyId: true, unitTypeId: true, createdAt: true },
      }),
      this.prisma.payment.findMany({
        where: { organizationId, status: 'SUCCESSFUL', confirmedAt: { gte: since30 } },
        select: {
          method: true,
          amount: true,
          tenancy: { select: { unit: { select: { propertyId: true } } } },
        },
      }),
    ]);

    const propertyIds = new Set(scope.propertyIds);
    const unitTypeIds = new Set(scope.unitTypeIds);
    if (scope.kind === 'portfolio') {
      unitTypeDefs.forEach((ut) => {
        propertyIds.add(ut.propertyId);
        unitTypeIds.add(ut.id);
      });
    } else if (scope.kind === 'property') {
      unitTypeDefs
        .filter((ut) => ut.propertyId === scope.propertyIds[0])
        .forEach((ut) => unitTypeIds.add(ut.id));
    }

    const scopedUnits = units.filter(
      (u) =>
        (!scope.propertyIds.length || scope.propertyIds.includes(u.propertyId)) &&
        (!scope.unitTypeIds.length || (u.unitTypeId != null && unitTypeIds.has(u.unitTypeId))),
    );

    const scopedDefs = unitTypeDefs.filter(
      (ut) => !scope.unitTypeIds.length || unitTypeIds.has(ut.id),
    );

    const scopedCharges = chargesAll.filter((c) => {
      if (!c.unit) return true;
      const okProp = !scope.propertyIds.length || propertyIds.has(c.unit.propertyId);
      const okType =
        !scope.unitTypeIds.length ||
        (c.unit.unitTypeId != null && unitTypeIds.has(c.unit.unitTypeId));
      return okProp && okType;
    });

    const scopedInquiries = inquiriesAll.filter(
      (q) =>
        (!scope.propertyIds.length || !q.propertyId || propertyIds.has(q.propertyId)) &&
        (!scope.unitTypeIds.length || !q.unitTypeId || unitTypeIds.has(q.unitTypeId)),
    );

    const scopedPayments30 = payments30.filter((pa) => {
      const prop = pa.tenancy?.unit?.propertyId;
      return !scope.propertyIds.length || (prop != null && propertyIds.has(prop));
    });

    // ── Occupancy ────────────────────────────────────────────────────
    const occ = this.computeOccupancy(scopedUnits, scopedDefs);

    // ── Payments (last 365d; headline RHS windowed to 30d collected) ──
    const pay = this.computePayments(scopedCharges);
    const collectedThisPeriod = this.sumCollected(scopedPayments30);

    // ── Inquiries ────────────────────────────────────────────────────
    const convertedTotal = scopedInquiries.filter(
      (q) => q.status === InquiryStatus.CONVERTED,
    ).length;

    // ── Per-unit-type breakdown ──────────────────────────────────────
    const unitTypes = scopedDefs.map((ut) => {
      const utUnits = units.filter((u) => u.unitTypeId === ut.id);
      const utCharges = chargesAll.filter((c) => c.unit?.unitTypeId === ut.id);
      const utInquiries = inquiriesAll.filter(
        (q) => q.unitTypeId === ut.id || (q.unitTypeId == null && q.propertyId === ut.propertyId),
      );
      const utOcc = this.computeOccupancy(utUnits, [ut]);
      const utPay90 = this.computePayments(utCharges, { windowDays: 90 });
      const utPay30 = this.computePayments(
        utCharges.filter((c) => c.billingPeriodEnd.getTime() >= Date.now() - 30 * DAY_MS),
        { windowDays: 30 },
      );
      const utInq30 = utInquiries.filter((q) => q.createdAt.getTime() >= Date.now() - 30 * DAY_MS);
      const utConverted30 = utInq30.filter((q) => q.status === InquiryStatus.CONVERTED).length;

      return {
        key: `${ut.propertyId}:${ut.id}`,
        propertyId: ut.propertyId,
        propertyName: ut.property.name,
        unitTypeId: ut.id,
        unitTypeName: ut.typeName,
        unitTypeKind: ut.unitType,
        baseRent: Number(ut.baseRent),
        totalUnits: utUnits.length || ut.totalCount,
        occupiedUnits: utOcc.occupied,
        vacantUnits: utOcc.vacant,
        occupancyRate: utOcc.occupancyRate,
        avgDaysToFill: utOcc.avgDaysToFill,
        currentVacantAvgDays: utOcc.vacantAvgDays,
        expectedRent30: utPay30.expectedRent,
        collectedRent30: utPay30.collectedRent,
        collectionRate: utPay30.collectionRate,
        onTimePaymentRate30: utPay30.onTimePaymentRate,
        onTimePaymentRate90: utPay90.onTimePaymentRate,
        inquiries30: utInq30.length,
        inquiriesConverted: utConverted30,
        conversionRate30:
          utInq30.length > 0 ? Math.round((utConverted30 / utInq30.length) * 1000) / 10 : null,
      };
    });

    const conversionRate =
      scopedInquiries.length > 0
        ? Math.round((convertedTotal / scopedInquiries.length) * 1000) / 10
        : null;

    // ── Trends ───────────────────────────────────────────────────────
    const trends = this.computeTrends(scopedUnits, scopedCharges);

    // ── Payment method breakdown (last 30 days) ──────────────────────
    const byMethodMap = new Map<string, number>();
    for (const pa of scopedPayments30) {
      byMethodMap.set(pa.method, (byMethodMap.get(pa.method) ?? 0) + Number(pa.amount));
    }
    const byMethod30 = [...byMethodMap.entries()]
      .map(([method, amount]) => ({ method, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount);

    const area = await this.buildAreaComparison(organizationId, scope, scopedDefs);

    return {
      scope: scope.label,
      currency: 'KES',
      viewsUnavailable: true,
      metrics: {
        occupancyRate: occ.occupancyRate,
        occupiedUnits: occ.occupied,
        totalUnits: occ.total,
        vacantUnits: occ.vacant,
        maintenanceUnits: occ.maintenance,
        avgDaysToFill: occ.avgDaysToFill,
        currentVacantAvgDays: occ.vacantAvgDays,
        onTimePaymentRate: pay.onTimePaymentRate,
        avgDaysLate: pay.avgDaysLate,
        expectedRent: pay.expectedRent,
        collectedRent: pay.collectedRent,
        collectedThisPeriod,
        outstandingRent: pay.outstandingRent,
        overdueRent: pay.overdueRent,
        collectionRate: pay.collectionRate,
        inquiriesTotal: scopedInquiries.length,
        inquiriesConverted: convertedTotal,
        conversionRate,
        viewsUnavailable: true,
      },
      trends,
      byMethod30,
      unitTypes,
      comparisons: { area },
    } satisfies AnalyticsBundle;
  }

  // ── Scope resolution ──────────────────────────────────────────────

  private async resolveScope(
    organizationId: string,
    query: GetAnalyticsQueryDto,
  ): Promise<ResolvedScopeParam> {
    if (query.unitTypeId) {
      const ut = await this.prisma.unitTypeDefinition.findFirst({
        where: {
          id: query.unitTypeId,
          deletedAt: null,
          property: { organizationId, deletedAt: null },
        },
        select: {
          id: true,
          typeName: true,
          propertyId: true,
          property: { select: { name: true } },
        },
      });
      if (!ut) throw new NotFoundException('Analytics not found');
      return {
        kind: 'unitType',
        label: {
          kind: 'unitType',
          propertyId: ut.propertyId,
          propertyName: ut.property.name,
          unitTypeId: ut.id,
          unitTypeName: ut.typeName,
        },
        propertyIds: [ut.propertyId],
        unitTypeIds: [ut.id],
      };
    }

    if (query.propertyId) {
      const property = await this.prisma.property.findFirst({
        where: { id: query.propertyId, organizationId, deletedAt: null },
        select: { id: true, name: true },
      });
      if (!property) throw new NotFoundException('Analytics not found');
      return {
        kind: 'property',
        label: { kind: 'property', propertyId: property.id, propertyName: property.name },
        propertyIds: [property.id],
        unitTypeIds: [],
      };
    }

    return {
      kind: 'portfolio',
      label: { kind: 'portfolio' },
      propertyIds: [],
      unitTypeIds: [],
    };
  }

  // ── Occupancy ─────────────────────────────────────────────────────

  private computeOccupancy(
    units: ScopedUnit[],
    defs: Array<{ totalCount: number; vacantCount: number }>,
  ) {
    const total = units.length;
    const occupied = units.filter((u) => u.availabilityStatus === 'OCCUPIED').length;
    const maintenance = units.filter((u) => u.availabilityStatus === 'MAINTENANCE').length;

    // Manual stock (no physical Unit rows): fall back to declared counts.
    const stockTotal = defs.reduce((s, d) => s + d.totalCount, 0);
    const stockVacant = defs.reduce((s, d) => s + d.vacantCount, 0);
    const effTotal = total || stockTotal;
    const effOccupied = total ? occupied : Math.max(0, stockTotal - stockVacant);

    const fillGaps: number[] = [];
    const vacantDurations: number[] = [];
    const today = Date.now();
    for (const u of units) {
      const sorted = [...u.tenancies]
        .filter((t) => t.startDate)
        .sort((a, b) => a.startDate!.getTime() - b.startDate!.getTime());
      for (let i = 1; i < sorted.length; i++) {
        const prevEnd = sorted[i - 1].endDate?.getTime();
        const nextStart = sorted[i].startDate!.getTime();
        if (prevEnd != null && prevEnd < nextStart && nextStart - prevEnd > DAY_MS) {
          fillGaps.push((nextStart - prevEnd) / DAY_MS);
        }
      }
      if (u.availabilityStatus === 'VACANT') {
        const anchor = sorted.length
          ? Math.max(...sorted.map((t) => (t.endDate ?? new Date(today)).getTime()))
          : (u.createdAt?.getTime() ?? today);
        vacantDurations.push(Math.max(1, (today - anchor) / DAY_MS));
      }
    }
    const avg = (xs: number[]) =>
      xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;

    return {
      total: effTotal,
      occupied: effOccupied,
      vacant: Math.max(0, effTotal - effOccupied),
      maintenance,
      occupancyRate: effTotal > 0 ? Math.round((effOccupied / effTotal) * 1000) / 10 : null,
      avgDaysToFill: avg(fillGaps),
      vacantAvgDays: avg(vacantDurations),
    };
  }

  // ── Payments ──────────────────────────────────────────────────────

  private computePayments(charges: ScopedCharge[], opts?: { windowDays?: number }) {
    let window = charges;
    if (opts?.windowDays) {
      const cut = Date.now() - opts.windowDays * DAY_MS;
      window = charges.filter((c) => c.billingPeriodEnd.getTime() >= cut);
    }

    const expectedRent = window.reduce((s, c) => s + Number(c.amount), 0);
    const collectedRent = window.reduce((s, c) => s + Number(c.amountPaid), 0);

    let overdueRent = 0;
    const paid = { onTime: 0, late: 0 };
    const lateDelays: number[] = [];
    for (const c of window) {
      const paidAmt = Number(c.amountPaid);
      if (c.dueDate.getTime() < Date.now() && paidAmt < Number(c.amount)) {
        overdueRent += Number(c.amount) - paidAmt;
      }
      if (c.status === 'PAID') {
        const confirmed = c.paymentAllocations
          .map((a) => a.payment.confirmedAt)
          .filter((d): d is Date => d != null);
        const last = confirmed.length ? Math.max(...confirmed.map((d) => d.getTime())) : null;
        if (last != null && last <= endOfDay(c.dueDate).getTime()) {
          paid.onTime++;
        } else if (last != null) {
          paid.late++;
          lateDelays.push(Math.max(0, Math.round((last - c.dueDate.getTime()) / DAY_MS)));
        }
      }
    }

    const paidTotal = paid.onTime + paid.late;
    return {
      expectedRent: Math.round(expectedRent * 100) / 100,
      collectedRent: Math.round(collectedRent * 100) / 100,
      outstandingRent: Math.round(Math.max(0, expectedRent - collectedRent) * 100) / 100,
      overdueRent: Math.round(overdueRent * 100) / 100,
      collectionRate:
        expectedRent > 0 ? Math.round((collectedRent / expectedRent) * 1000) / 10 : null,
      onTimePaymentRate: paidTotal > 0 ? Math.round((paid.onTime / paidTotal) * 1000) / 10 : null,
      avgDaysLate: lateDelays.length
        ? Math.round((lateDelays.reduce((a, b) => a + b, 0) / lateDelays.length) * 10) / 10
        : null,
    };
  }

  private sumCollected(payments: Array<{ amount: Prisma.Decimal | number }>) {
    return Math.round(payments.reduce((s, p) => s + Number(p.amount), 0) * 100) / 100;
  }

  // ── Trends ────────────────────────────────────────────────────────

  private computeTrends(units: ScopedUnit[], charges: ScopedCharge[]) {
    const makeBuckets = (spanDays: number, points: number) => {
      const out: Array<{ start: number; end: number; label: string }> = [];
      const step = Math.max(1, Math.round(spanDays / points));
      const now = Date.now();
      for (let i = 0; i < points; i++) {
        const end = now - i * step * DAY_MS;
        out.push({
          start: end - step * DAY_MS,
          end,
          label: new Date(end).toISOString().slice(0, 10),
        });
      }
      return out.reverse();
    };

    const occ = (buckets: Array<{ start: number; end: number; label: string }>) =>
      buckets.map((b) => ({
        period: b.label,
        value:
          units.length > 0
            ? Math.round(
                (units.filter((u) =>
                  u.tenancies.some(
                    (t) =>
                      t.startDate != null &&
                      t.startDate.getTime() <= b.end &&
                      (t.endDate == null || t.endDate.getTime() >= b.end),
                  ),
                ).length /
                  units.length) *
                  1000,
              ) / 10
            : 0,
      }));

    const paytn = (buckets: Array<{ start: number; end: number; label: string }>) =>
      buckets.map((b) => {
        const slice = charges.filter(
          (c) => c.billingPeriodEnd.getTime() >= b.start && c.billingPeriodEnd.getTime() <= b.end,
        );
        const p = this.computePayments(slice);
        return {
          period: b.label,
          expectedRent: p.expectedRent,
          collectedRent: p.collectedRent,
          onTimePaymentRate: p.onTimePaymentRate,
        };
      });

    return {
      occupancyTrend30: occ(makeBuckets(30, 20)),
      occupancyTrend90: occ(makeBuckets(90, 13)),
      occupancyTrend365: occ(makeBuckets(365, 12)),
      paymentTrend30: paytn(makeBuckets(30, 20)),
      paymentTrend90: paytn(makeBuckets(90, 13)),
      paymentTrend365: paytn(makeBuckets(365, 12)),
    };
  }

  // ── Comparative (aggregate, anonymized) ───────────────────────────

  private async buildAreaComparison(
    organizationId: string,
    scope: ResolvedScopeParam,
    scopedDefs: Array<{
      baseRent: Prisma.Decimal | number;
      unitType: string;
      property: { county: string | null };
    }>,
  ) {
    if (scope.kind === 'portfolio') return null;

    const county = scopedDefs[0]?.property.county;
    if (!county) return null;

    // Same-county public listings from OTHER landlords only. Aggregated to
    // an average with a minimum sample so a specific landlord's figures can
    // never be reverse-engineered from the response.
    const kind = scope.kind === 'unitType' ? (scopedDefs[0]?.unitType ?? null) : null;
    const areaListings = await this.prisma.unitTypeDefinition.findMany({
      where: {
        deletedAt: null,
        isPubliclyListable: true,
        property: {
          county,
          organizationId: { not: organizationId },
          deletedAt: null,
          status: 'ACTIVE',
        },
        ...(kind ? { unitType: kind as never } : {}),
      },
      select: { baseRent: true },
    });
    if (areaListings.length < 3) return null;

    const avgRent =
      Math.round(
        (areaListings.reduce((s, l) => s + Number(l.baseRent), 0) / areaListings.length) * 100,
      ) / 100;
    const yourAvgRent =
      Math.round(
        (scopedDefs.reduce((s, d) => s + Number(d.baseRent), 0) / Math.max(1, scopedDefs.length)) *
          100,
      ) / 100;
    return {
      sampleCount: areaListings.length,
      avgRent,
      yourAvgRent,
      deltaPct: avgRent > 0 ? Math.round(((yourAvgRent - avgRent) / avgRent) * 1000) / 10 : null,
      unitTypeLabel: scope.label.unitTypeName ?? 'similar units',
    };
  }
}

function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}
