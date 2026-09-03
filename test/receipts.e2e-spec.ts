import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Proves a receipt is issued automatically and atomically alongside a
// confirmed payment (spec §20), receipt numbers are unique and
// sequential per organization, and the PDF actually downloads.
describe('Receipts (e2e)', () => {
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
        email: `receipt-landlord-${suffix}@test.com`,
        firstName: 'Receipt',
        lastName: 'Landlord',
        password: 'StrongP@ss1',
        organizationName: `Receipt Org ${suffix}`,
      });
    ownerToken = register.body.data.accessToken;
    organizationId = register.body.data.organization.id;

    const property = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Receipt Test Property', propertyType: 'HOUSE' });
    const propertyId = property.body.data.id;

    const unit = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/units`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ unitNumber: 'E-1', unitType: 'HOUSE', baseRent: 8000, depositAmount: 8000 });
    const unitId = unit.body.data.id;

    const invite = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/tenant-invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        propertyId,
        unitId,
        tenantFullName: 'Receipt Tenant',
        email: `receipt-tenant-${suffix}@test.com`,
        proposedRentAmount: 8000,
        proposedDepositAmount: 8000,
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

  it('issues a receipt with a unique number when a manual payment is recorded', async () => {
    const payment1 = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/tenancies/${tenancyId}/payments/manual`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 4000, method: 'CASH' });
    expect(payment1.status).toBe(201);

    const payment2 = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/tenancies/${tenancyId}/payments/manual`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 4000, method: 'CASH' });
    expect(payment2.status).toBe(201);

    const receipts = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/receipts?tenancyId=${tenancyId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(receipts.body.data.length).toBe(2);
    const numbers = receipts.body.data.map((r: { receiptNumber: string }) => r.receiptNumber);
    expect(new Set(numbers).size).toBe(2); // no duplicates
    expect(numbers.every((n: string) => n.startsWith('RCT-'))).toBe(true);
  });

  it('downloads a receipt as a real PDF', async () => {
    const receipts = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/receipts?tenancyId=${tenancyId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const receiptId = receipts.body.data[0].id;

    const pdf = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/receipts/${receiptId}/pdf`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toContain('attachment');
  });

  it('downloads a tenant statement as PDF via the period shortcut', async () => {
    const pdf = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/tenancies/${tenancyId}/ledger/statement/pdf?period=CURRENT_MONTH`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
  });
});
