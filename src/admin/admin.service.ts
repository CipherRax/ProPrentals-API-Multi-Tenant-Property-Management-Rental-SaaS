import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { buildPaginatedResult, paginationSkip } from '../common/utils/paginate';

/**
 * Platform administration (spec §37). SUPER_ADMIN/SUPPORT_ADMIN views over
 * cross-tenant data: organizations, platform revenue, payment activity,
 * verification requests. Read-only by design — mutations stay in their
 * owning modules, and audit logging covers every admin read path the same
 * as anywhere else.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listOrganizations(query: { page?: number; limit?: number; search?: string }) {
    const where: Prisma.OrganizationWhereInput = {};
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
        { contactEmail: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 25, 100);

    const [data, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: paginationSkip(page, limit),
        take: limit,
        include: {
          _count: {
            select: {
              properties: true,
              tenantProfiles: true,
              members: true,
            },
          },
          subscriptions: true,
        },
      }),
      this.prisma.organization.count({ where }),
    ]);

    return buildPaginatedResult(data, total, page, limit);
  }

  async getOrganizationDetail(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        subscriptions: { include: { plan: true } },
        _count: {
          select: {
            properties: true,
            tenantProfiles: true,
            members: true,
            auditLogs: true,
          },
        },
      },
    });
    return org;
  }

  /** Platform-wide revenue + activity snapshot for the admin dashboard. */
  async platformDashboard() {
    const [
      organizations,
      activeSubscriptions,
      totalProperties,
      totalUnits,
      tenants,
      users,
      subscriptionRevenue,
      paymentActivity,
      verificationQueue,
    ] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      this.prisma.property.count({ where: { deletedAt: null } }),
      this.prisma.unit.count({ where: { deletedAt: null } }),
      this.prisma.tenantProfile.count({ where: { deletedAt: null } }),
      this.prisma.user.count(),
      this.prisma.subscriptionPayment.aggregate({
        where: { status: 'SUCCESSFUL' },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: { status: 'SUCCESSFUL' },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.property.count({ where: { verificationStatus: 'PENDING', deletedAt: null } }),
    ]);

    return {
      organizations,
      activeSubscriptions,
      totalProperties,
      totalUnits,
      tenants,
      users,
      platformRevenue: Number(subscriptionRevenue._sum.amount ?? 0),
      platformRevenuePayments: subscriptionRevenue._count,
      rentPaymentVolume: Number(paymentActivity._sum.amount ?? 0),
      rentPaymentCount: paymentActivity._count,
      verificationQueue,
    };
  }

  /** Properties awaiting platform verification (spec §33). */
  async listVerificationRequests(query: { page?: number; limit?: number; status?: string }) {
    const where: Prisma.PropertyWhereInput = {
      deletedAt: null,
      ...(query.status
        ? { verificationStatus: query.status as never }
        : { verificationStatus: 'PENDING' }),
    };

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 25, 100);

    const [data, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: paginationSkip(page, limit),
        take: limit,
        include: {
          organization: { select: { id: true, name: true, contactEmail: true } },
          _count: { select: { units: true, buildings: true } },
        },
      }),
      this.prisma.property.count({ where }),
    ]);

    return buildPaginatedResult(data, total, page, limit);
  }

  /** Update a property's verification status (platform staff only). */
  async updateVerificationStatus(
    propertyId: string,
    status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'UNVERIFIED',
    reason?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const property = await tx.property.findUnique({ where: { id: propertyId } });
      if (!property) return null;

      const updated = await tx.property.update({
        where: { id: propertyId },
        data: { verificationStatus: status },
      });

      await tx.auditLog.create({
        data: {
          organizationId: property.organizationId,
          action: 'PROPERTY_VERIFICATION_UPDATED',
          entityType: 'Property',
          entityId: propertyId,
          previousValue: { verificationStatus: property.verificationStatus },
          newValue: { verificationStatus: status, reason: reason ?? null },
        },
      });

      return updated;
    });
  }

  /** Recent platform payment activity (subscription + rent payments). */
  async platformPaymentActivity(query: { page?: number; limit?: number }) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 200);

    const [subscriptionPayments, total] = await Promise.all([
      this.prisma.subscriptionPayment.findMany({
        orderBy: { createdAt: 'desc' },
        skip: paginationSkip(page, limit),
        take: limit,
        include: { organization: { select: { id: true, name: true } } },
      }),
      this.prisma.subscriptionPayment.count(),
    ]);

    return buildPaginatedResult(subscriptionPayments, total, page, limit);
  }
}
