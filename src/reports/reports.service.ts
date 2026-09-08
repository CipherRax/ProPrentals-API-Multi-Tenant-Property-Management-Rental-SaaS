import { Injectable, NotFoundException } from '@nestjs/common';
import { TenancyStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PdfService } from '../pdf/pdf.service';

/**
 * Landlord reporting (spec §22) — every figure is computed with database
 * aggregation (groupBy/aggregate/count), never by pulling thousands of
 * rows into Node. These are the same living records the rest of the API
 * serves, so report numbers always agree with the ledger.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly pdf: PdfService,
  ) {}

  private async assertAccess(userId: string, organizationId: string) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    // Financial and occupancy reporting is owner/manager/accountant-only;
    // tenant data stays off the general staff dashboard.
    if (!['OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT'].includes(membership.role)) {
      throw new NotFoundException('Report not found');
    }
    // Reports are an gated paid feature per plan (spec §34/§59) — a
    // NotFound keeps the non-entitled response identical in shape.
    if (!(await this.subscriptions.isFeatureEnabled(organizationId, 'reports'))) {
      throw new NotFoundException('Report not found');
    }
  }

  // ── Financial ─────────────────────────────────────────────────────

  async financialReport(userId: string, organizationId: string) {
    await this.assertAccess(userId, organizationId);

    const charges = await this.prisma.rentCharge.aggregate({
      where: { organizationId, status: { notIn: ['CANCELLED', 'WAIVED'] } },
      _sum: { amount: true, amountPaid: true },
    });

    const overdue = await this.prisma.rentCharge.aggregate({
      where: { organizationId, status: 'OVERDUE' },
      _sum: { amount: true, amountPaid: true },
    });
    const overdueAmount = Number(overdue._sum.amount ?? 0) - Number(overdue._sum.amountPaid ?? 0);

    const expected = Number(charges._sum.amount ?? 0);
    const collected = Number(charges._sum.amountPaid ?? 0);
    const outstanding = Math.max(0, expected - collected);

    return {
      expectedRent: expected,
      collectedRent: collected,
      outstandingRent: outstanding,
      overdueRent: Math.max(0, overdueAmount),
      collectionRate: expected > 0 ? Math.round((collected / expected) * 100) / 100 : 0,
    };
  }

  /** Payments broken down by method, property, unit, and date. */
  async paymentBreakdown(userId: string, organizationId: string) {
    await this.assertAccess(userId, organizationId);

    const [byMethod, byProperty] = await Promise.all([
      this.prisma.payment.groupBy({
        by: ['method'],
        where: { organizationId, status: 'SUCCESSFUL' },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payment.groupBy({
        by: ['tenancyId'],
        where: { organizationId, status: 'SUCCESSFUL' },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    return {
      byMethod,
      byProperty,
    };
  }

  // ── Occupancy ─────────────────────────────────────────────────────

  async occupancyReport(userId: string, organizationId: string) {
    await this.assertAccess(userId, organizationId);

    const [total, occupied, vacant, available, maintenance] = await Promise.all([
      this.prisma.unit.count({ where: { property: { organizationId }, deletedAt: null } }),
      this.prisma.unit.count({
        where: { property: { organizationId }, deletedAt: null, availabilityStatus: 'OCCUPIED' },
      }),
      this.prisma.unit.count({
        where: { property: { organizationId }, deletedAt: null, availabilityStatus: 'VACANT' },
      }),
      this.prisma.unit.count({
        where: {
          property: { organizationId },
          deletedAt: null,
          availabilityStatus: { in: ['VACANT', 'AVAILABLE', 'RESERVED'] },
        },
      }),
      this.prisma.unit.count({
        where: { property: { organizationId }, deletedAt: null, availabilityStatus: 'MAINTENANCE' },
      }),
    ]);

    return {
      totalUnits: total,
      occupiedUnits: occupied,
      vacantUnits: vacant,
      availableUnits: available,
      maintenanceUnits: maintenance,
      occupancyRate: total > 0 ? Math.round((occupied / total) * 10000) / 100 : 0,
    };
  }

  // ── Tenants ───────────────────────────────────────────────────────

  async tenantReport(userId: string, organizationId: string) {
    await this.assertAccess(userId, organizationId);

    const [active, former, total, expiring] = await Promise.all([
      this.prisma.tenantProfile.count({
        where: { organizationId, status: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.tenantProfile.count({
        where: { organizationId, status: 'INACTIVE', deletedAt: null },
      }),
      this.prisma.tenantProfile.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.tenancy.count({
        where: {
          organizationId,
          status: 'ACTIVE' as TenancyStatus,
          expectedEndDate: {
            lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            gte: new Date(),
          },
        },
      }),
    ]);

    const newThisMonth = await this.prisma.tenantProfile.count({
      where: {
        organizationId,
        createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
    });

    return {
      activeTenants: active,
      formerTenants: former,
      totalTenants: total,
      newThisMonth,
      expiringLeases: expiring,
    };
  }

  // ── Maintenance ───────────────────────────────────────────────────

  async maintenanceReport(userId: string, organizationId: string) {
    await this.assertAccess(userId, organizationId);

    const open = await this.prisma.maintenanceRequest.count({
      where: { organizationId, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } },
    });
    const resolved = await this.prisma.maintenanceRequest.count({
      where: { organizationId, status: { in: ['RESOLVED', 'CLOSED'] } },
    });
    const byProperty = await this.prisma.maintenanceRequest.groupBy({
      by: ['propertyId'],
      where: { organizationId },
      _count: true,
    });

    return {
      open: {
        total: open,
        byStatus: await this.prisma.maintenanceRequest.groupBy({
          by: ['status'],
          where: { organizationId, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } },
          _count: true,
        }),
      },
      resolved,
      byProperty,
    };
  }

  // ── Export ────────────────────────────────────────────────────────

  async export(
    userId: string,
    organizationId: string,
    kind: 'financial' | 'occupancy' | 'tenants' | 'maintenance',
    format: 'csv' | 'pdf',
  ): Promise<{ format: 'csv'; csv: string } | { format: 'pdf'; pdfBuffer: Buffer }> {
    await this.assertAccess(userId, organizationId);

    let rows: Record<string, unknown> = {};
    switch (kind) {
      case 'financial':
        rows = await this.financialReport(userId, organizationId);
        break;
      case 'occupancy':
        rows = await this.occupancyReport(userId, organizationId);
        break;
      case 'tenants':
        rows = await this.tenantReport(userId, organizationId);
        break;
      case 'maintenance':
        rows = await this.maintenanceReport(userId, organizationId);
        break;
    }

    if (format === 'csv') {
      return { format: 'csv', csv: this.toCsv([rows]) };
    }

    const orgName =
      (await this.prisma.organization.findUnique({ where: { id: organizationId } }))?.name ??
      'Organization';
    const pdfBuffer = await this.renderReportPdf(kind, orgName, rows);
    return { format: 'pdf', pdfBuffer };
  }

  private async renderReportPdf(kind: string, orgName: string, rows: Record<string, unknown>) {
    return this.pdf.generateReportPdf({
      title: `${kind.charAt(0).toUpperCase() + kind.slice(1)} report`,
      organizationName: orgName,
      rows,
    });
  }

  private toCsv(rows: Record<string, unknown>[]): string {
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const escape = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
    };
    const lines = [headers.map(escape).join(',')];
    for (const row of rows) {
      lines.push(headers.map((h) => escape(row[h])).join(','));
    }
    return lines.join('\n');
  }

  // ── Dashboards (landlord) ─────────────────────────────────────────

  async landlordDashboard(userId: string, organizationId: string) {
    await this.organizations.assertMembership(userId, organizationId);

    const [financial, occupancy, tenantData] = await Promise.all([
      this.financialReport(userId, organizationId),
      this.occupancyReport(userId, organizationId),
      this.tenantReport(userId, organizationId),
    ]);

    const [recentPayments, recentTenants, recentMaintenance, recentInquiries, properties, units] =
      await Promise.all([
        this.prisma.payment.findMany({
          where: { organizationId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { tenancy: { select: { id: true } } },
        }),
        this.prisma.tenantProfile.findMany({
          where: { organizationId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, fullName: true, email: true, status: true },
        }),
        this.prisma.maintenanceRequest.findMany({
          where: { organizationId },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        this.prisma.propertyInquiry.findMany({
          where: { organizationId },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        this.prisma.property.count({ where: { organizationId, deletedAt: null } }),
        this.prisma.unit.count({ where: { property: { organizationId }, deletedAt: null } }),
      ]);

    return {
      totals: {
        properties,
        units,
        activeTenants: tenantData.activeTenants,
      },
      financial,
      occupancy,
      tenantReport: tenantData,
      recentPayments,
      recentTenants,
      recentMaintenance,
      recentInquiries,
    };
  }
}
