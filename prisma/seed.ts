import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
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
    update: {},
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
    update: {},
    create: { organizationId: demoOrg.id, userId: owner.id, role: 'OWNER' },
  });

  // eslint-disable-next-line no-console
  console.log('Seeded:', { superAdmin: superAdmin.email, demoOrg: demoOrg.slug, owner: owner.email });
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
