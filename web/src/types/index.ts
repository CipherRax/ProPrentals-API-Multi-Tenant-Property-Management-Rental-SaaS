/** Domain types mirroring the ProPrentals API (Prisma schema + controllers). */

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type PlatformRole = 'SUPER_ADMIN' | 'SUPPORT_ADMIN';
export type OrgRole = 'OWNER' | 'PROPERTY_MANAGER' | 'ACCOUNTANT' | 'CARETAKER' | 'STAFF';

export type PlanTier = 'FREE' | 'STARTER' | 'BUSINESS' | 'ENTERPRISE';
export type SubscriptionStatus =
  'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED' | 'SUSPENDED';
export type PropertyType =
  | 'APARTMENT_COMPLEX'
  | 'RESIDENTIAL_BUILDING'
  | 'HOUSE'
  | 'COMMERCIAL'
  | 'MIXED_USE'
  | 'STUDENT_HOUSING'
  | 'OTHER';
export type PropertyStatus = 'ACTIVE' | 'INACTIVE' | 'UNDER_CONSTRUCTION' | 'ARCHIVED';
export type UnitType =
  | 'APARTMENT'
  | 'BEDSITTER'
  | 'SINGLE_ROOM'
  | 'ONE_BEDROOM'
  | 'TWO_BEDROOM'
  | 'THREE_BEDROOM'
  | 'MAISONETTE'
  | 'HOUSE'
  | 'SHOP'
  | 'OFFICE'
  | 'PARKING_SPACE'
  | 'OTHER';
export type UnitAvailabilityStatus =
  'VACANT' | 'AVAILABLE' | 'RESERVED' | 'OCCUPIED' | 'MAINTENANCE' | 'UNAVAILABLE';
export type TenantProfileStatus = 'INVITED' | 'ACTIVE' | 'INACTIVE';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
export type BillingFrequency = 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
export type TenancyStatus = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'CANCELLED';
export type RentChargeStatus =
  'UNPAID' | 'OVERDUE' | 'PARTIALLY_PAID' | 'PAID' | 'WAIVED' | 'CANCELLED';
export type PaymentMethod = 'MPESA' | 'CASH' | 'BANK_TRANSFER' | 'OTHER';
export type PaymentStatus =
  'INITIATED' | 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'CANCELLED' | 'REVERSED' | 'REFUNDED';
export type DepositStatus = 'PENDING' | 'PARTIALLY_PAID' | 'FULLY_PAID' | 'PROCESSING' | 'SETTLED';
export type NotificationType =
  | 'RENT_DUE'
  | 'RENT_DUE_SOON'
  | 'RENT_OVERDUE'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_FAILED'
  | 'RECEIPT_GENERATED'
  | 'DEPOSIT_PROCESSED'
  | 'INVITATION_RECEIVED'
  | 'LEASE_EXPIRING'
  | 'RENT_CHANGED'
  | 'NEW_MESSAGE'
  | 'NEW_ANNOUNCEMENT'
  | 'MAINTENANCE_CREATED'
  | 'MAINTENANCE_UPDATED'
  | 'SUBSCRIPTION_EXPIRING'
  | 'SUBSCRIPTION_PAYMENT_CONFIRMED'
  | 'SUBSCRIPTION_PAYMENT_FAILED';
export type NotificationCategory =
  | 'RENT_REMINDERS'
  | 'PAYMENT_CONFIRMATIONS'
  | 'MESSAGES'
  | 'ANNOUNCEMENTS'
  | 'MAINTENANCE_UPDATES'
  | 'LEASE_REMINDERS';
export type AnnouncementAudience = 'ALL_TENANTS' | 'PROPERTY' | 'BUILDING' | 'UNITS' | 'TENANTS';
export type MaintenanceCategory =
  | 'PLUMBING'
  | 'ELECTRICAL'
  | 'SECURITY'
  | 'INTERNET'
  | 'STRUCTURAL'
  | 'CLEANING'
  | 'APPLIANCE'
  | 'OTHER';
export type MaintenancePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type MaintenanceStatus =
  'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'CANCELLED';
export type InquiryStatus = 'NEW' | 'CONTACTED' | 'INTERESTED' | 'CONVERTED' | 'CLOSED' | 'SPAM';
export type LedgerEntryType =
  | 'RENT_CHARGE'
  | 'PAYMENT'
  | 'REFUND'
  | 'LATE_FEE'
  | 'CREDIT_ADJUSTMENT'
  | 'DEBIT_ADJUSTMENT'
  | 'WAIVER';
export type LedgerEntryDirection = 'DEBIT' | 'CREDIT';
export type DepositTransactionType = 'PAYMENT' | 'DEDUCTION' | 'REFUND';
export type VerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  platformRole: PlatformRole;
  status: string;
  createdAt: string;
}

export interface Membership {
  organization: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string | null;
    description?: string | null;
    currency: string;
    timezone: string;
  };
  role: OrgRole;
}

export interface CurrentUser extends User {
  memberships: Membership[];
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  description?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  addressLine?: string | null;
  country?: string | null;
  currency: string;
  timezone: string;
  subscriptionPlan?: PlanTier;
  subscriptionStatus?: SubscriptionStatus;
  verificationStatus?: VerificationStatus;
  myRole?: OrgRole;
  createdAt: string;
}

export interface OrganizationWithRole {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  description?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  country?: string | null;
  currency: string;
  timezone: string;
  subscriptionPlan?: PlanTier;
  subscriptionStatus?: SubscriptionStatus;
  onboardingStep?: string | null;
  onboardingCompleted?: boolean;
  myRole: OrgRole;
}

export interface Property {
  id: string;
  name: string;
  propertyType: PropertyType;
  description?: string | null;
  addressLine?: string | null;
  county?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  postalAddress?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  amenities: string[];
  status: PropertyStatus;
  isPubliclyListable: boolean;
  verificationStatus: VerificationStatus;
  createdAt: string;
  images?: PropertyImage[];
  _count?: { units: number; buildings: number };
}

export interface PropertyImage {
  id: string;
  url: string;
  caption?: string | null;
}

export interface Building {
  id: string;
  name: string;
  buildingNumber?: string | null;
  description?: string | null;
  floors?: number | null;
  amenities: string[];
  createdAt: string;
  _count?: { units: number };
}

export interface Unit {
  id: string;
  buildingId?: string | null;
  unitNumber: string;
  unitType: UnitType;
  floor?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sizeSqm?: number | null;
  baseRent: string;
  depositAmount: string;
  description?: string | null;
  amenities: string[];
  isPubliclyListable: boolean;
  availabilityStatus: UnitAvailabilityStatus;
  createdAt: string;
  images?: { id: string; url: string; caption?: string | null }[];
  building?: { id: string; name: string } | null;
  tenancy?: Tenancy | null;
}

export interface TenantProfile {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  profileImageUrl?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  status: TenantProfileStatus;
  createdAt: string;
}

export interface TenantInvitation {
  id: string;
  token?: string;
  status: InvitationStatus;
  fullName: string;
  email: string;
  phone?: string | null;
  proposedRentAmount: string;
  proposedDepositAmount: string;
  proposedStartDate?: string | null;
  billingFrequency?: BillingFrequency | null;
  paymentDueDay?: number | null;
  expiresAt: string;
  unit?: { id: string; unitNumber: string };
  property?: { id: string; name: string };
  createdAt: string;
}

export interface Tenancy {
  id: string;
  startDate: string;
  endDate?: string | null;
  rentAmount: string;
  depositAmount: string;
  paymentDueDay?: number | null;
  billingFrequency: BillingFrequency;
  status: TenancyStatus;
  createdAt: string;
  unit?: { id: string; unitNumber: string; unitType: UnitType };
  tenant?: { id: string; fullName: string; email: string };
  property?: { id: string; name: string };
}

export interface RentConfiguration {
  id: string;
  amount: string;
  billingFrequency: BillingFrequency;
  paymentDueDay?: number | null;
  gracePeriodDays?: number | null;
  lateFeeAmount?: string | null;
  lateFeeIsPercentage?: boolean | null;
  effectiveFrom: string;
  createdAt: string;
}

export interface RentCharge {
  id: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amount: string;
  paidAmount: string;
  status: RentChargeStatus;
  waiveReason?: string | null;
  createdAt: string;
  tenancy?: { id: string; tenant?: { fullName: string }; unit?: { unitNumber: string } };
}

export interface LedgerEntry {
  id: string;
  type: LedgerEntryType;
  direction: LedgerEntryDirection;
  amount: string;
  description?: string | null;
  entryDate: string;
  reference?: string | null;
  createdAt: string;
}

export interface Statement {
  tenure?: { startDate: string; endDate?: string | null };
  tenant?: { id: string; fullName: string };
  unit?: { id: string; unitNumber: string };
  entries: LedgerEntry[];
  totals: { debit: string; credit: string; balance: string; paid: string; due: string };
}

export interface Payment {
  id: string;
  amount: string;
  method: PaymentMethod;
  status: PaymentStatus;
  manualReference?: string | null;
  notes?: string | null;
  paidAt?: string | null;
  createdAt: string;
  reference?: string | null;
  tenancy?: { id: string; tenant?: { fullName: string }; unit?: { unitNumber: string } };
  receipt?: { id: string; receiptNumber: string };
}

export interface Receipt {
  id: string;
  receiptNumber: string;
  amount: string;
  paymentMethod?: string | null;
  issuedAt: string;
  tenancy?: { id: string; tenant?: { fullName: string }; unit?: { unitNumber: string } };
}

export interface Deposit {
  id: string;
  amount: string;
  paidAmount: string;
  status: DepositStatus;
  createdAt: string;
  transactions?: DepositTransaction[];
}

export interface DepositTransaction {
  id: string;
  type: DepositTransactionType;
  amount: string;
  note?: string | null;
  createdAt: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message?: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationPreference {
  id: string;
  category: NotificationCategory;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
}

export interface Conversation {
  id: string;
  tenantProfileId: string;
  tenant?: { id: string; fullName: string; email: string };
  lastMessage?: string | null;
  unreadCount: number;
  updatedAt: string;
}

export interface Message {
  id: string;
  body: string;
  senderUserId?: string | null;
  senderRole?: string | null;
  read: boolean;
  attachmentUrl?: string | null;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  audience: AnnouncementAudience;
  scheduledAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  isRead?: boolean;
  property?: { id: string; name: string } | null;
  building?: { id: string; name: string } | null;
}

export interface MaintenanceRequest {
  id: string;
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  resolution?: string | null;
  createdAt: string;
  property?: { id: string; name: string } | null;
  unit?: { id: string; unitNumber: string } | null;
  tenant?: { id: string; fullName: string } | null;
}

export interface Listing {
  id: string;
  unitNumber: string;
  unitType: UnitType;
  baseRent: string;
  depositAmount: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sizeSqm?: number | null;
  description?: string | null;
  amenities: string[];
  images?: { url: string }[];
  property?: {
    id: string;
    name: string;
    city?: string | null;
    county?: string | null;
    neighborhood?: string | null;
  };
}

export interface Inquiry {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  message: string;
  status: InquiryStatus;
  createdAt: string;
  property?: { id: string; name: string } | null;
  unit?: { id: string; unitNumber: string } | null;
}

export interface Plan {
  id: string;
  tier: PlanTier;
  name: string;
  description?: string | null;
  priceMonthly: string;
  priceAnnual: string;
  maxProperties: number | null;
  maxUnits: number | null;
  maxTenants: number | null;
  maxStaff: number | null;
  features: string[];
  mpesaEnabled: boolean;
  smsEnabled: boolean;
  reportsEnabled: boolean;
  maintenanceEnabled: boolean;
  marketplaceEnabled: boolean;
  advancedAnalytics: boolean;
  isActive: boolean;
}

export interface Subscription {
  id: string;
  tier: PlanTier;
  status: SubscriptionStatus;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  trialEndsAt?: string | null;
  plan?: Plan | null;
}

export interface SubscriptionLimits {
  tier: PlanTier;
  name: string;
  planId: string;
  priceMonthly?: number | null;
  priceAnnual?: number | null;
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

export interface FinancialReport {
  expectedRent: number;
  collectedRent: number;
  outstandingRent: number;
  overdueRent: number;
  collectionRate: number;
}

export interface OccupancyReport {
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  availableUnits: number;
  maintenanceUnits: number;
  occupancyRate: number;
}

export interface TenantReport {
  totalTenants: number;
  activeTenants: number;
  inactiveTenants: number;
  [key: string]: unknown;
}

export interface MaintenanceReport {
  total: number;
  open: number;
  [key: string]: unknown;
}

export interface PaymentBreakdown {
  total: string;
  byMethod: Record<string, unknown>;
}

export interface DashboardData {
  stats?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  contactEmail?: string | null;
  verificationStatus: VerificationStatus;
  _count?: Record<string, number>;
  createdAt: string;
}

export interface AdminDashboard {
  [key: string]: unknown;
}

export interface AuditItem {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  createdAt: string;
  actor?: { id: string; firstName?: string; lastName?: string; email?: string };
}
