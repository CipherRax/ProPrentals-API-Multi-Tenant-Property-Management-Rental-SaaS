import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const PLANS = [
  {
    tier: 'FREE',
    name: 'Free',
    description: 'For small landlords exploring the platform',
    priceMonthly: 0,
    priceAnnual: 0,
    maxProperties: 1,
    maxUnits: null,
    maxTenants: null,
    maxStaff: 3,
    features: ['core'],
    mpesaEnabled: false,
    smsEnabled: false,
    reportsEnabled: false,
    maintenanceEnabled: false,
    marketplaceEnabled: false,
    advancedAnalytics: false,
  },
  {
    tier: 'STARTER',
    name: 'Starter',
    description: 'For growing landlords managing a handful of properties',
    priceMonthly: 1500,
    priceAnnual: 15000,
    maxProperties: 5,
    maxUnits: 50,
    maxTenants: null,
    maxStaff: 10,
    features: ['core', 'mpesa', 'analytics'],
    mpesaEnabled: true,
    smsEnabled: false,
    reportsEnabled: false,
    maintenanceEnabled: true,
    marketplaceEnabled: false,
    advancedAnalytics: true,
  },
  {
    tier: 'BUSINESS',
    name: 'Business',
    description: 'For professional property managers and agencies',
    priceMonthly: 4500,
    priceAnnual: 45000,
    maxProperties: 25,
    maxUnits: 250,
    maxTenants: null,
    maxStaff: 25,
    features: ['core', 'mpesa', 'sms', 'reports', 'maintenance', 'marketplace', 'analytics'],
    mpesaEnabled: true,
    smsEnabled: true,
    reportsEnabled: true,
    maintenanceEnabled: true,
    marketplaceEnabled: true,
    advancedAnalytics: true,
  },
  {
    tier: 'ENTERPRISE',
    name: 'Enterprise',
    description: 'Unlimited everything for large portfolios and groups',
    priceMonthly: 12000,
    priceAnnual: 120000,
    maxProperties: null,
    maxUnits: null,
    maxTenants: null,
    maxStaff: null,
    features: ['core', 'mpesa', 'sms', 'reports', 'maintenance', 'marketplace', 'analytics'],
    mpesaEnabled: true,
    smsEnabled: true,
    reportsEnabled: true,
    maintenanceEnabled: true,
    marketplaceEnabled: true,
    advancedAnalytics: true,
  },
] satisfies Array<{
  tier: 'FREE' | 'STARTER' | 'BUSINESS' | 'ENTERPRISE';
  name: string;
  description: string;
  priceMonthly: number;
  priceAnnual: number;
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
}>;

async function main() {
  // ── Subscription plans (configurable pricing — spec §34) ──────────
  const plans = new Map<string, string>();
  for (const plan of PLANS) {
    const row = await prisma.subscriptionPlan.upsert({
      where: { tier: plan.tier },
      update: { ...plan },
      create: { ...plan },
    });
    plans.set(plan.tier, row.id);
  }

  const passwordHash = await argon2.hash('SuperAdmin@123');

  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@proprentals.app' },
    update: {},
    create: {
      email: 'admin@proprentals.app',
      firstName: 'Platform',
      lastName: 'Admin',
      passwordHash,
      status: 'ACTIVE',
      platformRole: 'SUPER_ADMIN',
      emailVerifiedAt: new Date(),
    },
  });

  const demoOrg = await prisma.organization.upsert({
    where: { slug: 'demo-landlord-org' },
    update: {
      subscriptionPlan: 'BUSINESS',
      subscriptionStatus: 'ACTIVE',
    },
    create: {
      name: 'Demo Landlord Org',
      slug: 'demo-landlord-org',
      contactEmail: 'owner@demo-landlord.app',
      subscriptionPlan: 'BUSINESS',
      subscriptionStatus: 'ACTIVE',
    },
  });

  const ownerPasswordHash = await argon2.hash('DemoOwner@123');
  const owner = await prisma.user.upsert({
    where: { email: 'owner@demo-landlord.app' },
    update: {},
    create: {
      email: 'owner@demo-landlord.app',
      firstName: 'Demo',
      lastName: 'Owner',
      passwordHash: ownerPasswordHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: demoOrg.id, userId: owner.id } },
    update: { role: 'OWNER' },
    create: { organizationId: demoOrg.id, userId: owner.id, role: 'OWNER' },
  });

  // Keep the dedicated Subscription row in sync with the org's flat
  // subscriptionPlan/subscriptionStatus fields (used for quick reads).
  await prisma.subscription.upsert({
    where: { organizationId: demoOrg.id },
    update: {
      tier: 'BUSINESS',
      planId: plans.get('BUSINESS')!,
      status: 'ACTIVE',
    },
    create: {
      organizationId: demoOrg.id,
      tier: 'BUSINESS',
      planId: plans.get('BUSINESS')!,
      status: 'ACTIVE',
      startDate: new Date(),
    },
  });

  // ── Demo portfolio (idempotent find-or-create) ─────────────────────
  let demoProperty = await prisma.property.findFirst({
    where: { organizationId: demoOrg.id, name: 'Demo Villa Malaika' },
  });
  if (!demoProperty) {
    demoProperty = await prisma.property.create({
      data: {
        organizationId: demoOrg.id,
        name: 'Demo Villa Malaika',
        propertyType: 'RESIDENTIAL_BUILDING',
        description: 'A seeded demo property',
        city: 'Nairobi',
        county: 'Nairobi',
        neighborhood: 'Kilimani',
        addressLine: '123 Riviera Road',
        contactPhone: '+254700000001',
        contactEmail: demoOrg.contactEmail,
        isPubliclyListable: true,
        status: 'ACTIVE',
      },
    });
  }

  let demoBuilding = await prisma.building.findFirst({
    where: { propertyId: demoProperty.id, name: 'Block A' },
  });
  if (!demoBuilding) {
    demoBuilding = await prisma.building.create({
      data: {
        propertyId: demoProperty.id,
        name: 'Block A',
        buildingNumber: 'A',
        floors: 4,
        amenities: ['lift', 'backup generator'],
      },
    });
  }

  const demoUnits = [
    { unitNumber: 'A1', floor: '1', bedrooms: 1, bathrooms: 1, baseRent: 18000, depositAmount: 18000 },
    { unitNumber: 'A2', floor: '1', bedrooms: 2, bathrooms: 1, baseRent: 25000, depositAmount: 25000 },
    { unitNumber: 'A3', floor: '2', bedrooms: 3, bathrooms: 2, baseRent: 35000, depositAmount: 35000 },
  ];
  for (const unit of demoUnits) {
    await prisma.unit.upsert({
      where: {
        propertyId_unitNumber: { propertyId: demoProperty.id, unitNumber: unit.unitNumber },
      },
      update: { ...unit },
      create: {
        ...unit,
        propertyId: demoProperty.id,
        buildingId: demoBuilding.id,
        isPubliclyListable: true,
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log('Seeded:', {
    superAdmin: superAdmin.email,
    plans: [...plans.keys()],
    demoOrg: demoOrg.slug,
    owner: owner.email,
    property: demoProperty.name,
    units: demoUnits.map((u) => u.unitNumber),
  });
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });