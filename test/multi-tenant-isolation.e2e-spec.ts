import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Proves the single most important security property of the platform
// (spec §63): an authenticated user in Organization A cannot read,
// create under, or otherwise touch Organization B's data — even when
// they know or guess Organization B's real IDs. Covers properties, units,
// tenancies, tenancy financials, rent charges, payments, receipts,
// deposits, ledger, announcements, maintenance, staff, and invitations.
describe('Multi-tenant isolation (e2e)', () => {
  let app: INestApplication;

  let orgAToken: string;
  let orgAId: string;
  let orgBToken: string;
  let orgBTenantToken: string;
  let orgBId: string;
  let orgBPropertyId: string;
  let orgBUnitId: string;
  let tenancyBId: string;
  let chargeBId: string;
  let orgBAnnouncementId: string;
  let maintenanceBId: string;

  // Returns the 2xx/4xx status so a setup step failure surfaces the exact
  // HTTP code (e.g. a transient 429/409/500) instead of a silent TypeError.
  const expectCreated = (res: request.Response, what: string) => {
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    expect(res.body && res.body.data).toBeDefined();
    return res;
  };

  const expectOk = (res: request.Response, what: string) => {
    expect(res.status).toBe(200);
    expect(res.body && res.body.data).toBeDefined();
    return res;
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const suffix = Date.now();

    const registerA = expectCreated(
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: `org-a-${suffix}@test.com`,
          firstName: 'Org',
          lastName: 'A',
          password: 'StrongP@ss1',
          organizationName: `Org A ${suffix}`,
        }),
      'register org A',
    );
    orgAToken = registerA.body.data.accessToken;
    orgAId = registerA.body.data.organization.id;

    const registerB = expectCreated(
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: `org-b-${suffix}@test.com`,
          firstName: 'Org',
          lastName: 'B',
          password: 'StrongP@ss1',
          organizationName: `Org B ${suffix}`,
        }),
      'register org B',
    );
    orgBToken = registerB.body.data.accessToken;
    orgBId = registerB.body.data.organization.id;

    const propertyB = expectCreated(
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgBId}/properties`)
        .set('Authorization', `Bearer ${orgBToken}`)
        .send({ name: 'Org B Secret Property', propertyType: 'HOUSE' }),
      'create org B property',
    );
    orgBPropertyId = propertyB.body.data.id;

    const unitB = expectCreated(
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgBId}/properties/${orgBPropertyId}/units`)
        .set('Authorization', `Bearer ${orgBToken}`)
        .send({
          unitNumber: `B-${suffix}`,
          unitType: 'ONE_BEDROOM',
          baseRent: 12000,
          depositAmount: 12000,
        }),
      'create org B unit',
    );
    orgBUnitId = unitB.body.data.id;

    const inviteB = expectCreated(
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgBId}/tenant-invitations`)
        .set('Authorization', `Bearer ${orgBToken}`)
        .send({
          propertyId: orgBPropertyId,
          unitId: orgBUnitId,
          tenantFullName: 'Org B Tenant',
          email: `org-b-tenant-${suffix}@test.com`,
          proposedRentAmount: 12000,
          proposedDepositAmount: 12000,
          proposedStartDate: new Date().toISOString(),
        }),
      'invite org B tenant',
    );
    const acceptB = expectCreated(
      await request(app.getHttpServer())
        .post(`/api/v1/public/tenant-invitations/${inviteB.body.data.rawToken}/accept`)
        .send({ password: 'TenantP@ss1' }),
      'accept org B invite',
    );
    tenancyBId = acceptB.body.data.tenancyId;
    orgBTenantToken = acceptB.body.data.accessToken;

    // Maintenance is plan-gated — enable STARTER so Org B can create a request.
    const planChange = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgBId}/subscription/change-plan`)
      .set('Authorization', `Bearer ${orgBToken}`)
      .send({ tier: 'STARTER' });
    expect([200, 201, 204]).toContain(planChange.status);

    const maintB = expectCreated(
      await request(app.getHttpServer())
        .post('/api/v1/tenants/me/maintenance')
        .set('Authorization', `Bearer ${orgBTenantToken}`)
        .send({
          propertyId: orgBPropertyId,
          unitId: orgBUnitId,
          title: 'Leaking sink',
          description: 'The kitchen sink has been dripping all day.',
          category: 'PLUMBING',
          priority: 'HIGH',
        }),
      'create org B maintenance request',
    );
    maintenanceBId = maintB.body.data.id;

    const generated = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgBId}/rent-charges/generate-now`)
      .set('Authorization', `Bearer ${orgBToken}`);
    expect([200, 201]).toContain(generated.status);

    const chargesB = expectOk(
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgBId}/rent-charges?tenancyId=${tenancyBId}`)
        .set('Authorization', `Bearer ${orgBToken}`),
      'list org B rent charges',
    );
    expect(chargesB.body.data.length).toBeGreaterThan(0);
    chargeBId = chargesB.body.data[0].id;

    // Confirm a payment and a deposit payment so Org B has receipts & deposit rows.
    expectCreated(
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgBId}/tenancies/${tenancyBId}/payments/manual`)
        .set('Authorization', `Bearer ${orgBToken}`)
        .send({ amount: 5000, method: 'CASH', notes: 'Org B part payment' }),
      'org B manual payment',
    );

    expectCreated(
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgBId}/tenancies/${tenancyBId}/deposit/payments`)
        .set('Authorization', `Bearer ${orgBToken}`)
        .send({ amount: 5000, manualReference: 'ISO-001' }),
      'org B deposit payment',
    );

    const annB = expectCreated(
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgBId}/announcements`)
        .set('Authorization', `Bearer ${orgBToken}`)
        .send({ title: 'Org B secret announcement', message: 'Do not let Org A see this.' }),
      'org B announcement',
    );
    orgBAnnouncementId = annB.body.data.id;

    // Sanity: Org B own data was created.
    expect(orgAId).toBeDefined();
    expect(orgBUnitId).toBeDefined();
    expect(tenancyBId).toBeDefined();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects Org A reading Org B's organization record", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBId}`)
      .set('Authorization', `Bearer ${orgAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it("rejects Org A listing Org B's properties", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBId}/properties`)
      .set('Authorization', `Bearer ${orgAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('rejects Org A reading a specific Org B property by ID', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBId}/properties/${orgBPropertyId}`)
      .set('Authorization', `Bearer ${orgAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it("rejects Org A creating a property under Org B's organization", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgBId}/properties`)
      .set('Authorization', `Bearer ${orgAToken}`)
      .send({ name: 'Injected Property', propertyType: 'HOUSE' });
    expect([403, 404]).toContain(res.status);
  });

  it("rejects Org A listing Org B's units", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBId}/properties/${orgBPropertyId}/units`)
      .set('Authorization', `Bearer ${orgAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('rejects Org A reading an Org B unit by ID', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBId}/properties/${orgBPropertyId}/units/${orgBUnitId}`)
      .set('Authorization', `Bearer ${orgAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('rejects Org A creating a unit under Org B property', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgBId}/properties/${orgBPropertyId}/units`)
      .set('Authorization', `Bearer ${orgAToken}`)
      .send({ unitNumber: 'INJECTED', unitType: 'ONE_BEDROOM', baseRent: 5000, depositAmount: 5000 });
    expect([403, 404]).toContain(res.status);
  });

  it('rejects Org A updating an Org B unit', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/organizations/${orgBId}/properties/${orgBPropertyId}/units/${orgBUnitId}`)
      .set('Authorization', `Bearer ${orgAToken}`)
      .send({ baseRent: 1 });
    expect([403, 404]).toContain(res.status);
  });

  it('blocks IDOR: Org A cannot reach an Org B unit through its OWN organizationId', async () => {
    // Regression test: UnitsService.findOne previously loaded any unit when the
    // propertyId was NOT validated against the caller's organization.
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgAId}/properties/${orgBPropertyId}/units/${orgBUnitId}`)
      .set('Authorization', `Bearer ${orgAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it("rejects Org A listing Org B's tenancies", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBId}/tenancies`)
      .set('Authorization', `Bearer ${orgAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('rejects Org A reading an Org B tenancy by ID', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBId}/tenancies/${tenancyBId}`)
      .set('Authorization', `Bearer ${orgAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('rejects Org A reading an Org B tenancy financial summary', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBId}/tenancies/${tenancyBId}/financial-summary`)
      .set('Authorization', `Bearer ${orgAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('rejects Org A terminating an Org B tenancy', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/organizations/${orgBId}/tenancies/${tenancyBId}/terminate`)
      .set('Authorization', `Bearer ${orgAToken}`)
      .send({ terminationDate: new Date().toISOString(), terminationReason: 'Sneaky' });
    expect([403, 404]).toContain(res.status);
  });

  it("rejects Org A recording a manual payment on Org B's tenancy", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgBId}/tenancies/${tenancyBId}/payments/manual`)
      .set('Authorization', `Bearer ${orgAToken}`)
      .send({ amount: 12000, method: 'CASH' });
    expect([403, 404]).toContain(res.status);
  });

  it("rejects Org A listing Org B's payments", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBId}/payments`)
      .set('Authorization', `Bearer ${orgAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it("rejects Org A listing Org B's rent charges", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBId}/rent-charges`)
      .set('Authorization', `Bearer ${orgAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('rejects Org A reading an Org B rent charge by ID', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBId}/rent-charges/${chargeBId}`)
      .set('Authorization', `Bearer ${orgAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it("rejects Org A reading Org B's receipts", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBId}/receipts`)
      .set('Authorization', `Bearer ${orgAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it("rejects Org A reading Org B's deposit", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBId}/tenancies/${tenancyBId}/deposit`)
      .set('Authorization', `Bearer ${orgAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it("rejects Org A recording a deposit payment on Org B's tenancy", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgBId}/tenancies/${tenancyBId}/deposit/payments`)
      .set('Authorization', `Bearer ${orgAToken}`)
      .send({ amount: 5000, manualReference: 'SNEAKY' });
    expect([403, 404]).toContain(res.status);
  });

  it("rejects Org A reading Org B's ledger statement", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBId}/tenancies/${tenancyBId}/ledger/statement`)
      .set('Authorization', `Bearer ${orgAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it("rejects Org A posting a ledger adjustment to Org B's tenancy", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgBId}/tenancies/${tenancyBId}/ledger/adjustments`)
      .set('Authorization', `Bearer ${orgAToken}`)
      .send({ kind: 'CREDIT', amount: 5000, reason: 'Attempt to steal funds' });
    expect([403, 404]).toContain(res.status);
  });

  it("rejects Org A listing Org B's announcements", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBId}/announcements`)
      .set('Authorization', `Bearer ${orgAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('rejects Org A creating an announcement under Org B', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgBId}/announcements`)
      .set('Authorization', `Bearer ${orgAToken}`)
      .send({ title: 'Fake', message: 'Propaganda' });
    expect([403, 404]).toContain(res.status);
  });

  it("rejects Org A listing Org B's maintenance requests", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBId}/maintenance`)
      .set('Authorization', `Bearer ${orgAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('rejects Org A updating an Org B maintenance request status', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/organizations/${orgBId}/maintenance/${maintenanceBId}/status`)
      .set('Authorization', `Bearer ${orgAToken}`)
      .send({ status: 'RESOLVED' });
    expect([403, 404]).toContain(res.status);
  });

  it("rejects Org A listing Org B's tenant invitations", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBId}/tenant-invitations`)
      .set('Authorization', `Bearer ${orgAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('rejects Org A inviting a tenant into Org B', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgBId}/tenant-invitations`)
      .set('Authorization', `Bearer ${orgAToken}`)
      .send({
        propertyId: orgBPropertyId,
        unitId: orgBUnitId,
        tenantFullName: 'Sneaky',
        email: `sneaky-${Date.now()}@test.com`,
        proposedRentAmount: 10000,
        proposedDepositAmount: 10000,
      });
    expect([403, 404]).toContain(res.status);
  });

  it("rejects Org A listing Org B's staff", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBId}/staff`)
      .set('Authorization', `Bearer ${orgAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('rejects Org A inviting Org B staff', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgBId}/staff/invitations`)
      .set('Authorization', `Bearer ${orgAToken}`)
      .send({ email: `sneaky-staff-${Date.now()}@test.com`, role: 'PROPERTY_MANAGER' });
    expect([403, 404]).toContain(res.status);
  });

  it("rejects Org A running Org B's rent generation", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgBId}/rent-charges/generate-now`)
      .set('Authorization', `Bearer ${orgAToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('rejects Org B tenant (non-member token) touching org-scoped routes', async () => {
    // A tenant is NOT an OrganizationMember — even against their own org.
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBId}/properties`)
      .set('Authorization', `Bearer ${orgBTenantToken}`);
    expect([403, 404]).toContain(res.status);
  });

  it('allows Org B to read its own unit', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBId}/properties/${orgBPropertyId}/units/${orgBUnitId}`)
      .set('Authorization', `Bearer ${orgBToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(orgBUnitId);
  });

  it('allows Org B to read its own tenancy financial summary', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBId}/tenancies/${tenancyBId}/financial-summary`)
      .set('Authorization', `Bearer ${orgBToken}`);
    expect(res.status).toBe(200);
  });

  it('allows Org B tenant to read their own announcement feed', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/tenants/me/announcements')
      .set('Authorization', `Bearer ${orgBTenantToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((a: { id: string }) => a.id)).toContain(orgBAnnouncementId);
  });
});