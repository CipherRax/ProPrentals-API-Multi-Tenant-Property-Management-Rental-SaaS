import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Covers the tenant invitation → acceptance → tenancy lifecycle (spec
// §11, §72 rules 9/10/11) plus the cross-org isolation guarantee for
// invitations specifically (an org cannot invite tenants into another
// org's units even if it somehow has the unit's real UUID).
describe('Tenant invitation flow (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let organizationId: string;
  let propertyId: string;
  let unitId: string;
  let unitTypeId: string;

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
        email: `landlord-${suffix}@test.com`,
        firstName: 'Land',
        lastName: 'Lord',
        password: 'StrongP@ss1',
        organizationName: `Landlord Org ${suffix}`,
      });
    ownerToken = register.body.data.accessToken;
    organizationId = register.body.data.organization.id;

    const property = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Test Property', propertyType: 'HOUSE' });
    propertyId = property.body.data.id;

    const unit = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/units`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        unitNumber: 'A-1',
        unitTypeName: 'ONE_BEDROOM',
        baseRent: 15000,
        depositAmount: 15000,
      });
    unitId = unit.body.data.id;
    unitTypeId = unit.body.data.unitTypeId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('invites, previews, accepts, and creates an active tenancy that occupies the unit', async () => {
    const suffix = Date.now();
    const tenantEmail = `tenant-${suffix}@test.com`;

    const invite = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/tenant-invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        propertyId,
        unitId,
        tenantFullName: 'Test Tenant',
        email: tenantEmail,
        proposedRentAmount: 15000,
        proposedDepositAmount: 15000,
      });
    expect(invite.status).toBe(201);
    const rawToken = invite.body.data.rawToken;
    expect(typeof rawToken).toBe('string');

    const preview = await request(app.getHttpServer()).get(
      `/api/v1/public/tenant-invitations/${rawToken}`,
    );
    expect(preview.status).toBe(200);
    expect(preview.body.data.unit.unitNumber).toBe('A-1');
    // Must never leak internal IDs in the public preview.
    expect(preview.body.data.unitId).toBeUndefined();
    expect(preview.body.data.organizationId).toBeUndefined();

    const accept = await request(app.getHttpServer())
      .post(`/api/v1/public/tenant-invitations/${rawToken}/accept`)
      .send({ password: 'TenantP@ss1' });
    expect(accept.status).toBe(200);
    expect(accept.body.data.accessToken).toBeDefined();

    // Second use of the same token must fail — single-use enforcement.
    const secondAccept = await request(app.getHttpServer())
      .post(`/api/v1/public/tenant-invitations/${rawToken}/accept`)
      .send({ password: 'TenantP@ss1' });
    expect([404, 409, 410]).toContain(secondAccept.status);

    const unitAfter = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/properties/${propertyId}/units/${unitId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(unitAfter.body.data.availabilityStatus).toBe('OCCUPIED');
    // The unit type's AUTO vacancy should drop when the tenancy occupies the unit.
    const typeAfter = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/properties/${propertyId}/unit-types/${unitTypeId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(typeAfter.body.data.vacantCount).toBe(0);
  });

  it("rejects inviting a tenant into another organization's unit", async () => {
    const suffix = Date.now();
    const registerOther = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `other-landlord-${suffix}@test.com`,
        firstName: 'Other',
        lastName: 'Landlord',
        password: 'StrongP@ss1',
        organizationName: `Other Org ${suffix}`,
      });
    const otherOrgId = registerOther.body.data.organization.id;
    const otherToken = registerOther.body.data.accessToken;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${otherOrgId}/tenant-invitations`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        propertyId, // belongs to the first organization, not otherOrgId
        unitId,
        tenantFullName: 'Sneaky Tenant',
        email: `sneaky-${suffix}@test.com`,
        proposedRentAmount: 15000,
        proposedDepositAmount: 15000,
      });
    expect([403, 404]).toContain(res.status);
  });
});
