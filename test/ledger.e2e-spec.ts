import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Proves the ledger is the actual source of truth for balance (spec
// §73): a generated rent charge shows up as a debit, waiving it posts
// an offsetting credit rather than editing the original row, and a
// manual adjustment behaves the same way — reversal never deletes.
describe('Ledger (e2e)', () => {
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
        email: `ledger-landlord-${suffix}@test.com`,
        firstName: 'Ledger',
        lastName: 'Landlord',
        password: 'StrongP@ss1',
        organizationName: `Ledger Org ${suffix}`,
      });
    ownerToken = register.body.data.accessToken;
    organizationId = register.body.data.organization.id;

    const property = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Ledger Test Property', propertyType: 'HOUSE' });
    const propertyId = property.body.data.id;

    const unit = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/units`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ unitNumber: 'C-1', unitType: 'HOUSE', baseRent: 10000, depositAmount: 10000 });
    const unitId = unit.body.data.id;

    const invite = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/tenant-invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        propertyId,
        unitId,
        tenantFullName: 'Ledger Tenant',
        email: `ledger-tenant-${suffix}@test.com`,
        proposedRentAmount: 10000,
        proposedDepositAmount: 10000,
        proposedStartDate: new Date().toISOString(),
      });
    const accept = await request(app.getHttpServer())
      .post(`/api/v1/public/tenant-invitations/${invite.body.data.rawToken}/accept`)
      .send({ password: 'TenantP@ss1' });
    tenancyId = accept.body.data.tenancyId;

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/rent-charges/generate-now`)
      .set('Authorization', `Bearer ${ownerToken}`);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reflects the generated rent charge as a debit in the statement', async () => {
    const statement = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/tenancies/${tenancyId}/ledger/statement`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(statement.status).toBe(200);
    expect(statement.body.data.closingBalance).toBe(10000);
    expect(statement.body.data.entries[0].entryType).toBe('RENT_CHARGE');
    expect(statement.body.data.entries[0].direction).toBe('DEBIT');
  });

  it('waiving the charge posts an offsetting credit rather than editing history', async () => {
    const charges = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/rent-charges?tenancyId=${tenancyId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const chargeId = charges.body.data[0].id;

    const waive = await request(app.getHttpServer())
      .patch(`/api/v1/organizations/${organizationId}/rent-charges/${chargeId}/waive`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ reason: 'Goodwill waiver for testing' });
    expect(waive.status).toBe(200);

    const statement = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/tenancies/${tenancyId}/ledger/statement`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(statement.body.data.closingBalance).toBe(0);
    expect(statement.body.data.entries).toHaveLength(2);
    expect(statement.body.data.entries[1].entryType).toBe('WAIVER');
  });

  it('manual adjustment reversal restores the prior balance without deleting the original entry', async () => {
    const adjust = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/tenancies/${tenancyId}/ledger/adjustments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ kind: 'DEBIT', amount: 500, reason: 'Manual charge for testing' });
    expect(adjust.status).toBe(201);
    const entryId = adjust.body.data.id;

    const afterAdjust = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/tenancies/${tenancyId}/ledger/statement`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(afterAdjust.body.data.closingBalance).toBe(500);

    const reverse = await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${organizationId}/tenancies/${tenancyId}/ledger/entries/${entryId}/reverse`,
      )
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(reverse.status).toBe(201);

    const afterReverse = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/tenancies/${tenancyId}/ledger/statement`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(afterReverse.body.data.closingBalance).toBe(0);
    // Original entry must still exist, unedited — total entry count grows,
    // it never shrinks or gets overwritten.
    expect(afterReverse.body.data.entries.length).toBe(4);

    // A second reversal attempt of the same entry must be rejected.
    const secondReverse = await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${organizationId}/tenancies/${tenancyId}/ledger/entries/${entryId}/reverse`,
      )
      .set('Authorization', `Bearer ${ownerToken}`);
    expect([409, 400]).toContain(secondReverse.status);
  });
});
