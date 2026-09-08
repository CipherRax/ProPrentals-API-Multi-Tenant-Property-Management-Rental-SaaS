import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Proves the full deposit lifecycle (spec §23): auto-created PENDING on
// tenancy creation, moves through PARTIALLY_PAID/FULLY_PAID as money is
// recorded, auto-flips to PROCESSING when the tenancy is terminated, and
// settlement enforces that deductions + refund can never exceed what
// was actually paid in.
describe('Security deposits (e2e)', () => {
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
        email: `deposit-landlord-${suffix}@test.com`,
        firstName: 'Deposit',
        lastName: 'Landlord',
        password: 'StrongP@ss1',
        organizationName: `Deposit Org ${suffix}`,
      });
    ownerToken = register.body.data.accessToken;
    organizationId = register.body.data.organization.id;

    const property = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Deposit Test Property', propertyType: 'HOUSE' });
    const propertyId = property.body.data.id;

    const unit = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/units`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ unitNumber: 'F-1', unitType: 'HOUSE', baseRent: 10000, depositAmount: 10000 });
    const unitId = unit.body.data.id;

    const invite = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/tenant-invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        propertyId,
        unitId,
        tenantFullName: 'Deposit Tenant',
        email: `deposit-tenant-${suffix}@test.com`,
        proposedRentAmount: 10000,
        proposedDepositAmount: 10000,
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

  it('is auto-created as PENDING when the tenancy is created', async () => {
    const deposit = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/tenancies/${tenancyId}/deposit`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(deposit.status).toBe(200);
    expect(deposit.body.data.status).toBe('PENDING');
    expect(Number(deposit.body.data.requiredAmount)).toBe(10000);
  });

  it('moves through PARTIALLY_PAID to FULLY_PAID as payments are recorded', async () => {
    const partial = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/tenancies/${tenancyId}/deposit/payments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 6000, manualReference: 'DEP-1' });
    expect(partial.status).toBe(201);
    expect(partial.body.data.status).toBe('PARTIALLY_PAID');

    const full = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/tenancies/${tenancyId}/deposit/payments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 4000, manualReference: 'DEP-2' });
    expect(full.status).toBe(201);
    expect(full.body.data.status).toBe('FULLY_PAID');
    expect(Number(full.body.data.amountPaid)).toBe(10000);
  });

  it('flips to PROCESSING when the tenancy is terminated', async () => {
    const terminate = await request(app.getHttpServer())
      .patch(`/api/v1/organizations/${organizationId}/tenancies/${tenancyId}/terminate`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ terminationDate: new Date().toISOString(), terminationReason: 'End of test lease' });
    expect(terminate.status).toBe(200);

    const deposit = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/tenancies/${tenancyId}/deposit`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(deposit.body.data.status).toBe('PROCESSING');
  });

  it('rejects settlement that deducts/refunds more than was actually paid in', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/tenancies/${tenancyId}/deposit/process`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        deductions: [{ amount: 8000, reason: 'Excessive cleaning required after move-out' }],
        refundAmount: 5000, // 8000 + 5000 = 13000 > 10000 paid in
      });
    expect(res.status).toBe(400);
  });

  it('settles the deposit with a deduction and a refund, summing correctly', async () => {
    const process = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/tenancies/${tenancyId}/deposit/process`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        deductions: [{ amount: 3000, reason: 'Cleaning and minor wall repair' }],
        refundAmount: 7000,
      });
    expect(process.status).toBe(201);
    expect(process.body.data.status).toBe('SETTLED');
    expect(Number(process.body.data.amountDeducted)).toBe(3000);
    expect(Number(process.body.data.amountRefunded)).toBe(7000);
  });

  it('shows deposit status alongside rent balance in the financial summary', async () => {
    const summary = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/tenancies/${tenancyId}/financial-summary`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(summary.status).toBe(200);
    expect(summary.body.data.deposit.status).toBe('SETTLED');
    expect(typeof summary.body.data.rentBalance).toBe('number');
  });
});
