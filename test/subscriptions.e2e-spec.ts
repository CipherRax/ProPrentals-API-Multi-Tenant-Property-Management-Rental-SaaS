import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Prisma, PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';

// Covers the configurable subscription plan catalog and plan-limit
// enforcement (spec §34/§59): plans are DB rows, not hardcoded constants,
// and exceeding a plan's property limit returns a clear business error.
describe('Subscriptions & plan limits (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let organizationId: string;

  const prisma = new PrismaClient();

  beforeAll(async () => {
    // Plans are configurable rows; make sure the catalog exists regardless
    // of whether the seed was run, so this spec is hermetic.
    const plans: Prisma.SubscriptionPlanUncheckedCreateInput[] = [
      {
        tier: 'FREE',
        name: 'Free',
        priceMonthly: 0,
        maxProperties: 1,
        maxUnits: null,
        maxTenants: null,
        maxStaff: 3,
      },
      {
        tier: 'STARTER',
        name: 'Starter',
        priceMonthly: 1500,
        maxProperties: 5,
        maxUnits: 50,
        maxTenants: null,
        maxStaff: 10,
      },
      {
        tier: 'BUSINESS',
        name: 'Business',
        priceMonthly: 4500,
        maxProperties: 25,
        maxUnits: 250,
        maxTenants: null,
        maxStaff: 25,
        reportsEnabled: true,
        maintenanceEnabled: true,
      },
      {
        tier: 'ENTERPRISE',
        name: 'Enterprise',
        priceMonthly: 12000,
        maxProperties: null,
        maxUnits: null,
        maxTenants: null,
        maxStaff: null,
        reportsEnabled: true,
      },
    ];
    for (const plan of plans) {
      await prisma.subscriptionPlan.upsert({
        where: { tier: plan.tier },
        update: { ...plan },
        create: { ...plan },
      });
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const suffix = Date.now();
    const register = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `subs-owner-${suffix}@test.com`,
        firstName: 'Subs',
        lastName: 'Owner',
        password: 'StrongP@ss1',
        organizationName: `Subs Org ${suffix}`,
      });
    ownerToken = register.body.data.accessToken;
    organizationId = register.body.data.organization.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('publishes the configurable plan catalog as a public endpoint', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/subscriptions/plans');
    expect(res.status).toBe(200);
    const tiers = res.body.data.map((p: { tier: string }) => p.tier);
    expect(tiers).toContain('FREE');
    expect(tiers).toContain('BUSINESS');
  });

  it('blocks a second property on the free plan with a clear upgrade error', async () => {
    const suffix = Date.now();
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `free-owner-${suffix}@test.com`,
        firstName: 'Free',
        lastName: 'Owner',
        password: 'StrongP@ss1',
        organizationName: `Free Org ${suffix}`,
      });
    const token = reg.body.data.accessToken;
    const orgId = reg.body.data.organization.id;

    const first = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/properties`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'First', propertyType: 'HOUSE' });
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/properties`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Second', propertyType: 'HOUSE' });
    expect(second.status).toBe(403);
    expect(second.body.message).toMatch(/upgrade your subscription/i);
  });

  it('lets the owner change plan and reflects the new effective limits', async () => {
    const change = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/subscription/change-plan`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ tier: 'BUSINESS' });
    expect(change.status).toBe(201);

    const limits = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/subscription/limits`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(limits.status).toBe(200);
    expect(limits.body.data.tier).toBe('BUSINESS');
    expect(limits.body.data.maxProperties).toBe(25);
    expect(limits.body.data.reportsEnabled).toBe(true);

    const org = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(org.status).toBe(200);
    expect(org.body.data.subscriptionPlan).toBe('BUSINESS');
  });

  it('returns the organization subscription with its linked plan', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/subscription`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.tier).toBe('BUSINESS');
    expect(res.body.data.plan.name).toBe('Business');
  });
});
