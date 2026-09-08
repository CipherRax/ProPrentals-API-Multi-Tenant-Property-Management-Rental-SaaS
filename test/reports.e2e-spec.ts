import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';

// Landlord reporting (spec §22/§59): summary reports must agree with the
// ledger and only render on plans with reportsEnabled (a paid feature).
describe('Reports (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let organizationId: string;
  let propertyId: string;
  let unitId: string;

  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.subscriptionPlan.upsert({
      where: { tier: 'BUSINESS' },
      update: {
        name: 'Business',
        priceMonthly: 4500,
        maxProperties: 25,
        maxUnits: 250,
        maxTenants: null,
        maxStaff: 25,
        reportsEnabled: true,
      },
      create: {
        tier: 'BUSINESS',
        name: 'Business',
        priceMonthly: 4500,
        maxProperties: 25,
        maxUnits: 250,
        maxTenants: null,
        maxStaff: 25,
        reportsEnabled: true,
      },
    });

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
        email: `reports-owner-${suffix}@test.com`,
        firstName: 'Rep',
        lastName: 'Owner',
        password: 'StrongP@ss1',
        organizationName: `Reports Org ${suffix}`,
      });
    ownerToken = register.body.data.accessToken;
    organizationId = register.body.data.organization.id;

    // Reports are gated behind reportsEnabled — enable BUSINESS.
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/subscription/change-plan`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ tier: 'BUSINESS' });

    const property = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Reports Property', propertyType: 'HOUSE' });
    propertyId = property.body.data.id;

    const unit = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/units`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        unitNumber: 'RPT-1',
        unitType: 'ONE_BEDROOM',
        baseRent: 11000,
        depositAmount: 11000,
      });
    unitId = unit.body.data.id;

    const invite = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/tenant-invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        propertyId,
        unitId,
        tenantFullName: 'Reports Tenant',
        email: `reports-tenant-${suffix}@test.com`,
        proposedRentAmount: 11000,
        proposedDepositAmount: 11000,
      });
    expect(invite.status).toBe(201);

    await request(app.getHttpServer())
      .post(`/api/v1/public/tenant-invitations/${invite.body.data.rawToken}/accept`)
      .send({ password: 'TenantP@ss1' });

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/rent-charges/generate-now`)
      .set('Authorization', `Bearer ${ownerToken}`);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('financial report reflects generated rent charges', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/reports/financial`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.expectedRent).toBeGreaterThanOrEqual(11000);
  });

  it('occupancy report counts the occupied and vacant units', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/reports/occupancy`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalUnits).toBe(1);
    expect(res.body.data.occupiedUnits).toBe(1);
  });

  it('payment breakdown and tenant report respond with stable shapes', async () => {
    const breakdown = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/reports/financial/payment-breakdown`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(breakdown.status).toBe(200);
    expect(Array.isArray(breakdown.body.data.byMethod)).toBe(true);

    const tenants = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/reports/tenants`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(tenants.status).toBe(200);
    expect(tenants.body.data.activeTenants).toBe(1);

    const maintenance = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/reports/maintenance`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(maintenance.status).toBe(200);
  });

  it('exports a report as CSV', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/reports/export/financial?format=csv`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(String(res.text)).toContain('expectedRent');
  });

  it('withholds reports from a free-plan organization', async () => {
    const suffix = Date.now();
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `reports-free-${suffix}@test.com`,
        firstName: 'Free',
        lastName: 'Reporter',
        password: 'StrongP@ss1',
        organizationName: `Free Reporter ${suffix}`,
      });
    const token = reg.body.data.accessToken;
    const orgId = reg.body.data.organization.id;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgId}/reports/financial`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
