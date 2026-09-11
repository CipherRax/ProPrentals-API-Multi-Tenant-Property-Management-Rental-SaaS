/** Tenant portal types mirroring the /tenants/me/* API (Prisma models + services). */

import type {
  TenancyStatus,
  TenantProfileStatus,
  RentChargeStatus,
  PaymentMethod,
  PaymentStatus,
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceStatus,
  AnnouncementAudience,
  BillingFrequency,
  DepositStatus,
  DepositTransactionType,
  LedgerEntryType,
  LedgerEntryDirection,
  NotificationType,
} from '@/types';

export interface TenantNotification {
  id: string;
  organizationId: string | null;
  recipientUserId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: unknown;
  readAt: string | null;
  createdAt: string;
}

export interface TenantDashboardData {
  hasActiveTenancy: boolean;
  message?: string;
  tenancy?: {
    id: string;
    status: TenancyStatus;
    startDate: string;
    expectedEndDate?: string | null;
    property: { id: string; name: string; addressLine?: string | null; city?: string | null };
    building?: { id: string; name: string } | null;
    unit: { unitNumber: string; unitTypeDefinition?: { id: string; typeName: string } | null; floor?: string | null };
  };
  currentRentAmount?: number;
  nextDueDate?: string | null;
  currentBalance?: number;
  rentStatus?: string;
  recentCharges?: TenantRentChargeListItem[];
  lastPayment?: TenantPayment | null;
  latestReceipt?: TenantReceipt | null;
  unreadNotifications?: number;
  recentNotifications?: TenantNotification[];
  openMaintenanceRequests?: number;
}

export interface TenantRentChargeListItem {
  id: string;
  organizationId: string;
  tenancyId: string;
  unitId: string;
  rentConfigurationId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  amount: string;
  amountPaid: string;
  dueDate: string;
  status: RentChargeStatus;
  waivedReason?: string | null;
  createdAt: string;
}

export interface MyRentCharge {
  id: string;
  organizationId: string;
  tenancyId: string;
  unitId: string;
  rentConfigurationId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  amount: string;
  amountPaid: string;
  dueDate: string;
  status: RentChargeStatus;
  waivedReason?: string | null;
  waivedByUserId?: string | null;
  waivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  unit: { id: string; unitNumber: string; propertyId: string };
}

export interface TenantLedgerEntry {
  id: string;
  organizationId: string;
  tenancyId: string;
  entryType: LedgerEntryType;
  direction: LedgerEntryDirection;
  amount: string;
  description?: string | null;
  relatedRentChargeId?: string | null;
  relatedPaymentId?: string | null;
  reversesEntryId?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
  signedAmount: number;
  runningBalance: number;
}

export interface TenantStatement {
  tenancyId: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  closingBalance: number;
  entries: TenantLedgerEntry[];
}

export interface TenantPaymentAllocation {
  id: string;
  paymentId: string;
  rentChargeId: string;
  amount: string;
  createdAt: string;
}

export interface TenantPayment {
  id: string;
  organizationId: string;
  tenancyId: string;
  amount: string;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  providerCheckoutId?: string | null;
  providerTransactionId?: string | null;
  phoneNumber?: string | null;
  failureReason?: string | null;
  manualReference?: string | null;
  notes?: string | null;
  initiatedByUserId?: string | null;
  initiatedAt: string;
  confirmedAt?: string | null;
  failedAt?: string | null;
  createdAt: string;
  allocations?: TenantPaymentAllocation[];
}

export interface TenantReceipt {
  id: string;
  organizationId: string;
  tenancyId: string;
  paymentId: string;
  receiptNumber: string;
  amount: string;
  issuedAt: string;
  createdAt: string;
  payment?: {
    id: string;
    amount: string;
    currency: string;
    method: PaymentMethod;
    status: PaymentStatus;
    phoneNumber?: string | null;
    confirmedAt?: string | null;
    createdAt: string;
  };
}

export interface TenantDepositTransaction {
  id: string;
  depositId: string;
  type: DepositTransactionType;
  amount: string;
  reason?: string | null;
  authorizedByUserId?: string | null;
  manualReference?: string | null;
  transactionDate: string;
  createdAt: string;
}

export interface TenantDeposit {
  id: string;
  organizationId: string;
  tenancyId: string;
  requiredAmount: string;
  amountPaid: string;
  amountDeducted: string;
  amountRefunded: string;
  status: DepositStatus;
  createdAt: string;
  updatedAt: string;
  transactions?: TenantDepositTransaction[];
}

export interface MyMaintenanceRequest {
  id: string;
  organizationId: string;
  propertyId: string;
  unitId: string;
  tenantUserId: string;
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  resolution?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  unit: { unitNumber: string; property: { name: string } };
}

export interface MyAnnouncement {
  id: string;
  organizationId: string;
  title: string;
  message: string;
  audience: AnnouncementAudience;
  createdByUserId?: string | null;
  propertyId?: string | null;
  buildingId?: string | null;
  unitIds?: string[];
  tenantProfileIds?: string[];
  scheduledAt?: string | null;
  publishedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  organization: { name: string; logoUrl?: string | null };
}

export interface MyConversation {
  id: string;
  organizationId: string;
  tenantUserId: string;
  createdAt: string;
  updatedAt: string;
  organization: { id: string; name: string; logoUrl?: string | null };
  messages: MyMessage[];
}

export interface MyMessage {
  id: string;
  conversationId: string;
  senderUserId: string;
  body: string;
  attachmentUrl?: string | null;
  createdAt: string;
  sender?: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string | null;
  } | null;
}

export interface MyTenantTenancy {
  id: string;
  organizationId: string;
  unitId: string;
  tenantProfileId: string;
  startDate: string;
  expectedEndDate?: string | null;
  endDate?: string | null;
  rentAmount: string;
  depositAmount: string;
  paymentDueDay: number;
  billingFrequency: BillingFrequency;
  status: TenancyStatus;
  agreementUrl?: string | null;
  notes?: string | null;
  terminationDate?: string | null;
  terminationReason?: string | null;
  createdAt: string;
  updatedAt: string;
  unit: { id: string; unitNumber: string; propertyId: string };
}

export interface MyTenantProfile {
  id: string;
  organizationId: string;
  userId: string;
  fullName: string;
  email: string;
  phone?: string | null;
  profileImageUrl?: string | null;
  idNumber?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  addressLine?: string | null;
  status: TenantProfileStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  organization: { id: string; name: string; logoUrl?: string | null };
  tenancies: MyTenantTenancy[];
}