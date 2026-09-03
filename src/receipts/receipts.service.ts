import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { PdfService } from '../pdf/pdf.service';

type Tx = Prisma.TransactionClient;

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly pdf: PdfService,
  ) {}

  /**
   * Called from within the SAME transaction that confirms a payment
   * (manual recording, or the M-Pesa callback) — a receipt only ever
   * exists alongside a genuinely successful payment, never independently
   * (spec §72 rule 5: a receipt cannot be generated twice for the same
   * payment — enforced here by Payment.receipt being a 1:1 relation with
   * a unique paymentId, so a second attempt hits a unique constraint
   * rather than silently duplicating).
   *
   * Numbering: Organization.receiptSequence is atomically incremented
   * via Prisma's {increment: 1}, which Postgres executes as a single
   * UPDATE ... SET x = x + 1 — safe under concurrent payments for the
   * same organization, no read-then-write race window.
   */
  async issueReceiptForPayment(
    tx: Tx,
    organizationId: string,
    tenancyId: string,
    paymentId: string,
    amount: number | Prisma.Decimal,
  ) {
    const org = await tx.organization.update({
      where: { id: organizationId },
      data: { receiptSequence: { increment: 1 } },
    });

    const receiptNumber = `RCT-${org.slug.split('-')[0].toUpperCase().slice(0, 6)}-${String(org.receiptSequence).padStart(6, '0')}`;

    return tx.receipt.create({
      data: { organizationId, tenancyId, paymentId, receiptNumber, amount },
    });
  }

  // ── Landlord-facing ─────────────────────────────────────────────────

  async findAll(userId: string, organizationId: string, tenancyId?: string) {
    await this.organizations.assertMembership(userId, organizationId);
    return this.prisma.receipt.findMany({
      where: { organizationId, ...(tenancyId ? { tenancyId } : {}) },
      orderBy: { issuedAt: 'desc' },
      include: { payment: true },
    });
  }

  async getPdf(userId: string, organizationId: string, receiptId: string): Promise<Buffer> {
    await this.organizations.assertMembership(userId, organizationId);
    const receipt = await this.loadReceiptWithContext(receiptId, organizationId);
    return this.renderReceiptPdf(receipt);
  }

  // ── Tenant-facing self-service ──────────────────────────────────────

  async getMyReceiptPdf(userId: string, receiptId: string): Promise<Buffer> {
    const receipt = await this.loadReceiptWithContext(receiptId);
    if (receipt.tenancy.tenantProfile.userId !== userId) {
      throw new NotFoundException('Receipt not found');
    }
    return this.renderReceiptPdf(receipt);
  }

  async getMyReceipts(userId: string) {
    return this.prisma.receipt.findMany({
      where: { tenancy: { tenantProfile: { userId } } },
      orderBy: { issuedAt: 'desc' },
      include: { payment: true },
    });
  }

  // ── Shared ──────────────────────────────────────────────────────────

  private async loadReceiptWithContext(receiptId: string, organizationId?: string) {
    const receipt = await this.prisma.receipt.findFirst({
      where: { id: receiptId, ...(organizationId ? { organizationId } : {}) },
      include: {
        organization: true,
        payment: true,
        tenancy: {
          include: {
            unit: { include: { property: true } },
            tenantProfile: true,
          },
        },
      },
    });
    if (!receipt) throw new NotFoundException('Receipt not found');
    return receipt;
  }

  private async renderReceiptPdf(
    receipt: Prisma.ReceiptGetPayload<{
      include: {
        organization: true;
        payment: true;
        tenancy: { include: { unit: { include: { property: true } }; tenantProfile: true } };
      };
    }>,
  ): Promise<Buffer> {
    return this.pdf.generateReceiptPdf({
      receiptNumber: receipt.receiptNumber,
      issuedAt: receipt.issuedAt,
      organizationName: receipt.organization.name,
      organizationContactEmail: receipt.organization.contactEmail,
      tenantName: receipt.tenancy.tenantProfile.fullName,
      propertyName: receipt.tenancy.unit.property.name,
      unitNumber: receipt.tenancy.unit.unitNumber,
      amount: Number(receipt.amount),
      currency: receipt.organization.currency,
      paymentMethod: receipt.payment.method,
      transactionReference: receipt.payment.providerTransactionId ?? receipt.payment.manualReference,
      description: `${receipt.payment.method} payment for tenancy`,
    });
  }
}
