import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Landlord-to-tenant announcements (spec §26): publish to an audience,
// list org-wide with read-receipt counts, and confirm the target tenant
// can actually see announcements addressed to them.
describe('Announcements (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let tenantToken: string;
  let organizationId: string;
  let announcementId: string;

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
        email: `ann-owner-${suffix}@test.com`,
        firstName: 'Ann',
        lastName: 'Owner',
        password: 'StrongP@ss1',
        organizationName: `Ann Org ${suffix}`,
      });
    ownerToken = register.body.data.accessToken;
    organizationId = register.body.data.organization.id;

    const property = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Ann Property', propertyType: 'HOUSE' });
    const propertyId = property.body.data.id;

    const unit = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/units`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        unitNumber: 'ANN-1',
        unitType: 'ONE_BEDROOM',
        baseRent: 12000,
        depositAmount: 12000,
      });
    const unitId = unit.body.data.id;

    const invite = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/tenant-invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        propertyId,
        unitId,
        tenantFullName: 'Ann Tenant',
        email: `ann-tenant-${suffix}@test.com`,
        proposedRentAmount: 12000,
        proposedDepositAmount: 12000,
      });
    expect(invite.status).toBe(201);

    const accept = await request(app.getHttpServer())
      .post(`/api/v1/public/tenant-invitations/${invite.body.data.rawToken}/accept`)
      .send({ password: 'TenantP@ss1' });
    tenantToken = accept.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('owner publishes an announcement to all tenants', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/announcements`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: 'Water shutdown Saturday',
        message: 'Water will be off for maintenance from 9am to 12pm.',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Water shutdown Saturday');
    announcementId = res.body.data.id;
  });

  it('lists announcements org-wide with read-receipt count', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/announcements`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    const found = res.body.data.find((a: { id: string }) => a.id === announcementId);
    expect(found).toBeDefined();
    expect(found._count.readStates).toBe(0);
  });

  it('the invited tenant sees the announcement in their tenant feed', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/tenants/me/announcements')
      .set('Authorization', `Bearer ${tenantToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((a: { id: string }) => a.id)).toContain(announcementId);
  });

  it('records a read state once the tenant opens the announcement', async () => {
    const read = await request(app.getHttpServer())
      .get(`/api/v1/tenants/me/announcements/${announcementId}`)
      .set('Authorization', `Bearer ${tenantToken}`);
    expect(read.status).toBe(200);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/announcements/${announcementId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.readStates).toHaveLength(1);
    expect(detail.body.data.readStates[0].user.email).not.toBe(ownerToken);
  });
});
