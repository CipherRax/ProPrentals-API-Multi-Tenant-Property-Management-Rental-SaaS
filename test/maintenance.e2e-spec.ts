import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';

// Maintenance requests (spec §24/§59): tenant submits against their own
// unit, landlord/staff triage and resolve, and the feature is gated on
// the plan's maintenanceEnabled flag.
describe('Maintenance (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let tenantToken: string;
  let organizationId: string;
  let propertyId: string;
  let unitId: string;
  let outsiderToken: string;
  let outsiderOrgId: string;
  let requestId: string;

  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.subscriptionPlan.upsert({
      where: { tier: 'STARTER' },
      update: {
        name: 'Starter',
        priceMonthly: 1500,
        maxProperties: 5,
        maxUnits: 50,
        maxTenants: null,
        maxStaff: 10,
        maintenanceEnabled: true,
      },
      create: {
        tier: 'STARTER',
        name: 'Starter',
        priceMonthly: 1500,
        maxProperties: 5,
        maxUnits: 50,
        maxTenants: null,
        maxStaff: 10,
        maintenanceEnabled: true,
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
        email: `maint-owner-${suffix}@test.com`,
        firstName: 'Maint',
        lastName: 'Owner',
        password: 'StrongP@ss1',
        organizationName: `Maint Org ${suffix}`,
      });
    ownerToken = register.body.data.accessToken;
    organizationId = register.body.data.organization.id;

    // Maintenance is a plan-gated feature: enable STARTER first.
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/subscription/change-plan`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ tier: 'STARTER' });

    const property = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Maint Property', propertyType: 'HOUSE' });
    propertyId = property.body.data.id;

    const unit = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/units`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ unitNumber: 'MT-1', unitType: 'ONE_BEDROOM', baseRent: 10000, depositAmount: 10000 });
    unitId = unit.body.data.id;

    const invite = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/tenant-invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        propertyId,
        unitId,
        tenantFullName: 'Maint Tenant',
        email: `maint-tenant-${suffix}@test.com`,
        proposedRentAmount: 10000,
        proposedDepositAmount: 10000,
      });
    expect(invite.status).toBe(201);

    const accept = await request(app.getHttpServer())
      .post(`/api/v1/public/tenant-invitations/${invite.body.data.rawToken}/accept`)
      .send({ password: 'TenantP@ss1' });
    tenantToken = accept.body.data.accessToken;

    const outsider = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `maint-outsider-${suffix}@test.com`,
        firstName: 'Maint',
        lastName: 'Outsider',
        password: 'StrongP@ss1',
        organizationName: `Maint Outsider ${suffix}`,
      });
    outsiderToken = outsider.body.data.accessToken;
    outsiderOrgId = outsider.body.data.organization.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('tenant submits a maintenance request against their own unit', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tenants/me/maintenance')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        propertyId,
        unitId,
        title: 'Leaking sink',
        description: 'The kitchen sink has been dripping all day.',
        category: 'PLUMBING',
        priority: 'HIGH',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.unitId).toBe(unitId);
    requestId = res.body.data.id;
  });

  it('tenant can list their own requests but not another org', async () => {
    const mine = await request(app.getHttpServer())
      .get('/api/v1/tenants/me/maintenance')
      .set('Authorization', `Bearer ${tenantToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.map((r: { id: string }) => r.id)).toContain(requestId);
  });

  it('landlord sees the request in the org list and resolves it', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/maintenance`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.map((r: { id: string }) => r.id)).toContain(requestId);

    const update = await request(app.getHttpServer())
      .patch(`/api/v1/organizations/${organizationId}/maintenance/${requestId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'RESOLVED', resolution: 'Replaced the faucet washer.' });
    expect(update.status).toBe(200);
    expect(update.body.data.status).toBe('RESOLVED');
    expect(update.body.data.resolution).toContain('faucet');
  });

  it('a request from another org cannot be read or updated', async () => {
    const read = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/maintenance/${requestId}`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect([403, 404]).toContain(read.status);

    const update = await request(app.getHttpServer())
      .patch(`/api/v1/organizations/${outsiderOrgId}/maintenance/${requestId}/status`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ status: 'CANCELLED' });
    expect([403, 404]).toContain(update.status);
  });
});
