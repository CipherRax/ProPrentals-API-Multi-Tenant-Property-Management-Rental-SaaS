import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Proves the rent-generation job is idempotent (spec §14, §49): calling
// generate-now twice back-to-back must produce exactly one charge for
// the current billing period, not two.
describe('Rent generation (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let organizationId: string;
  let tenancyId: string;

  beforeAll(async () => {
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
        email: `rent-landlord-${suffix}@test.com`,
        firstName: 'Rent',
        lastName: 'Landlord',
        password: 'StrongP@ss1',
        organizationName: `Rent Org ${suffix}`,
      });
    ownerToken = register.body.data.accessToken;
    organizationId = register.body.data.organization.id;

    const property = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Rent Test Property', propertyType: 'HOUSE' });
    const propertyId = property.body.data.id;

    const unit = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/units`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ unitNumber: 'B-1', unitType: 'HOUSE', baseRent: 20000, depositAmount: 20000 });
    const unitId = unit.body.data.id;

    const invite = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/tenant-invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        propertyId,
        unitId,
        tenantFullName: 'Rent Tenant',
        email: `rent-tenant-${suffix}@test.com`,
        proposedRentAmount: 20000,
        proposedDepositAmount: 20000,
        proposedStartDate: new Date().toISOString(),
      });
    const accept = await request(app.getHttpServer())
      .post(`/api/v1/public/tenant-invitations/${invite.body.data.rawToken}/accept`)
      .send({ password: 'TenantP@ss1' });
    tenancyId = accept.body.data.tenancyId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('generates exactly one rent charge per billing period, even if run twice', async () => {
    const first = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/rent-charges/generate-now`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/rent-charges/generate-now`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(second.status).toBe(201);

    const charges = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/rent-charges?tenancyId=${tenancyId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(charges.body.data.length).toBe(1);
    expect(Number(charges.body.data[0].amount)).toBe(20000);
    expect(charges.body.data[0].status).toBe('UNPAID');
  });
});
