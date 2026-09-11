import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { LedgerService } from '../ledger/ledger.service';

/**
 * Tenant dashboard (spec §56) — one aggregated response instead of a
 * frontend making a dozen requests. Everything is derived from the
 * tenant's own records: never trusts tenant-supplied org/unit IDs.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async tenantDashboard(userId: string) {
    const activeTenancy = await this.prisma.tenancy.findFirst({
      where: { tenantProfile: { userId }, status: 'ACTIVE' },
      orderBy: { startDate: 'desc' },
      include: {
        unit: {
          include: {
            property: { select: { id: true, name: true, addressLine: true, city: true } },
            building: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!activeTenancy) {
      return {
        hasActiveTenancy: false,
        message: 'No active tenancy found for this account.',
      };
    }

    const [
      balance,
      rentCharges,
      lastPayment,
      recentNotifications,
      unreadNotifications,
      openMaintenance,
    ] = await Promise.all([
      this.ledger.getBalance(activeTenancy.organizationId, activeTenancy.id),
      this.prisma.rentCharge.findMany({
        where: { tenancyId: activeTenancy.id },
        orderBy: { dueDate: 'desc' },
        take: 6,
      }),
      this.prisma.payment.findFirst({
        where: { tenancyId: activeTenancy.id, status: 'SUCCESSFUL' },
        orderBy: { confirmedAt: 'desc' },
      }),
      this.prisma.notification.findMany({
        where: { recipientUserId: userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.notification.count({ where: { recipientUserId: userId, readAt: null } }),
      this.prisma.maintenanceRequest.count({
        where: { tenantUserId: userId, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } },
      }),
    ]);

    const currentRentConfig = await this.prisma.rentConfiguration.findFirst({
      where: { tenancyId: activeTenancy.id, effectiveTo: null },
      orderBy: { effectiveFrom: 'desc' },
    });

    const latestReceipt = await this.prisma.receipt.findFirst({
      where: { tenancyId: activeTenancy.id },
      orderBy: { issuedAt: 'desc' },
    });

    const nextDue = rentCharges.find(
      (c) => c.status === 'UNPAID' || c.status === 'PARTIALLY_PAID' || c.status === 'OVERDUE',
    );

    return {
      hasActiveTenancy: true,
      tenancy: {
        id: activeTenancy.id,
        status: activeTenancy.status,
        startDate: activeTenancy.startDate,
        expectedEndDate: activeTenancy.expectedEndDate,
        property: activeTenancy.unit.property,
        building: activeTenancy.unit.building,
        unit: {
          unitNumber: activeTenancy.unit.unitNumber,
          unitTypeId: activeTenancy.unit.unitTypeId,
          floor: activeTenancy.unit.floor,
        },
      },
      currentRentAmount: currentRentConfig?.amount
        ? Number(currentRentConfig.amount)
        : Number(activeTenancy.rentAmount),
      nextDueDate: nextDue?.dueDate ?? null,
      currentBalance: balance,
      rentStatus: nextDue?.status ?? (balance >= 0 ? 'PAID' : 'OVERPAID'),
      recentCharges: rentCharges,
      lastPayment,
      latestReceipt,
      unreadNotifications,
      recentNotifications,
      openMaintenanceRequests: openMaintenance,
    };
  }
}
