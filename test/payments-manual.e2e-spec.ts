import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Proves manual payments correctly allocate against outstanding rent
// charges and flip RentCharge.status based on the ACTUAL amount paid
// (spec §16, §73) — never a client-supplied status. Also proves partial
// payments produce PARTIALLY_PAID rather than jumping straight to PAID.
describe('Manual payments (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let organizationId: string;
  let tenancyId: string;
  let chargeId: string;

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
        email: `pay-landlord-${suffix}@test.com`,
        firstName: 'Pay',
        lastName: 'Landlord',
        password: 'StrongP@ss1',
        organizationName: `Pay Org ${suffix}`,
      });
    ownerToken = register.body.data.accessToken;
    organizationId = register.body.data.organization.id;

    const property = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Pay Test Property', propertyType: 'HOUSE' });
    const propertyId = property.body.data.id;

    const unit = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/units`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ unitNumber: 'D-1', unitType: 'HOUSE', baseRent: 12000, depositAmount: 12000 });
    const unitId = unit.body.data.id;

    const invite = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/tenant-invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        propertyId,
        unitId,
        tenantFullName: 'Pay Tenant',
        email: `pay-tenant-${suffix}@test.com`,
        proposedRentAmount: 12000,
        proposedDepositAmount: 12000,
        proposedStartDate: new Date().toISOString(),
      });
    const accept = await request(app.getHttpServer())
      .post(`/api/v1/public/tenant-invitations/${invite.body.data.rawToken}/accept`)
      .send({ password: 'TenantP@ss1' });
    tenancyId = accept.body.data.tenancyId;

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/rent-charges/generate-now`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const charges = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/rent-charges?tenancyId=${tenancyId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    chargeId = charges.body.data[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('a partial payment moves the charge to PARTIALLY_PAID, not PAID', async () => {
    const partial = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/tenancies/${tenancyId}/payments/manual`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 5000, method: 'CASH', notes: 'Partial rent payment' });
    expect(partial.status).toBe(201);

    const charge = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/rent-charges/${chargeId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(charge.body.data.status).toBe('PARTIALLY_PAID');
    expect(Number(charge.body.data.amountPaid)).toBe(5000);

    const statement = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/tenancies/${tenancyId}/ledger/statement`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(statement.body.data.closingBalance).toBe(7000); // 12000 charge - 5000 paid
  });

  it('completing the payment moves the charge to PAID and zeroes the balance', async () => {
    const rest = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/tenancies/${tenancyId}/payments/manual`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 7000, method: 'BANK_TRANSFER', manualReference: 'REF-001' });
    expect(rest.status).toBe(201);

    const charge = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/rent-charges/${chargeId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(charge.body.data.status).toBe('PAID');
    expect(Number(charge.body.data.amountPaid)).toBe(12000);

    const statement = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/tenancies/${tenancyId}/ledger/statement`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(statement.body.data.closingBalance).toBe(0);
  });
});
