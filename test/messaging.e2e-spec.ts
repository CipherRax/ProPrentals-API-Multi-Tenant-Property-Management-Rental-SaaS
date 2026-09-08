import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Proves the core messaging flow (spec §25): a conversation is shared
// between a tenant and any staff member of the org (not a rigid 1:1
// pair), pagination is enforced on message history, read state is
// tracked per-user, and — the recurring theme of this whole build — an
// outsider (a member of a completely different org) cannot access a
// conversation they're not part of, even with a real conversation ID.
describe('Messaging (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let organizationId: string;
  let tenantToken: string;
  let tenantProfileId: string;
  let conversationId: string;

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
        email: `chat-landlord-${suffix}@test.com`,
        firstName: 'Chat',
        lastName: 'Landlord',
        password: 'StrongP@ss1',
        organizationName: `Chat Org ${suffix}`,
      });
    ownerToken = register.body.data.accessToken;
    organizationId = register.body.data.organization.id;

    const property = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Chat Test Property', propertyType: 'HOUSE' });
    const propertyId = property.body.data.id;

    const unit = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/units`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ unitNumber: 'H-1', unitType: 'HOUSE', baseRent: 9000, depositAmount: 9000 });
    const unitId = unit.body.data.id;

    const invite = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/tenant-invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        propertyId,
        unitId,
        tenantFullName: 'Chat Tenant',
        email: `chat-tenant-${suffix}@test.com`,
        proposedRentAmount: 9000,
        proposedDepositAmount: 9000,
        proposedStartDate: new Date().toISOString(),
      });
    const accept = await request(app.getHttpServer())
      .post(`/api/v1/public/tenant-invitations/${invite.body.data.rawToken}/accept`)
      .send({ password: 'TenantP@ss1' });
    tenantToken = accept.body.data.accessToken;

    const tenants = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/tenants`)
      .set('Authorization', `Bearer ${ownerToken}`);
    tenantProfileId = tenants.body.data[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('landlord starts a conversation with the tenant', async () => {
    const conv = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/conversations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ tenantProfileId });
    expect(conv.status).toBe(201);
    conversationId = conv.body.data.id;

    // Calling it again with the same tenant returns the SAME
    // conversation rather than creating a duplicate.
    const again = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/conversations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ tenantProfileId });
    expect(again.body.data.id).toBe(conversationId);
  });

  it('the tenant can independently find the same conversation', async () => {
    const conv = await request(app.getHttpServer())
      .post('/api/v1/tenants/me/conversations')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({ organizationId });
    expect(conv.status).toBe(201);
    expect(conv.body.data.id).toBe(conversationId);
  });

  it('sends and retrieves messages, tracking unread counts per-user', async () => {
    const send = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'Hi! Just checking in about the unit.' });
    expect(send.status).toBe(201);

    const tenantUnread = await request(app.getHttpServer())
      .get(`/api/v1/tenants/me/conversations/${conversationId}/unread-count`)
      .set('Authorization', `Bearer ${tenantToken}`);
    expect(tenantUnread.body.data).toBe(1);

    const messages = await request(app.getHttpServer())
      .get(`/api/v1/tenants/me/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tenantToken}`);
    expect(messages.status).toBe(200);
    expect(messages.body.data.length).toBe(1);
    expect(messages.body.meta.total).toBe(1);

    await request(app.getHttpServer())
      .patch(`/api/v1/tenants/me/conversations/${conversationId}/read`)
      .set('Authorization', `Bearer ${tenantToken}`);

    const afterRead = await request(app.getHttpServer())
      .get(`/api/v1/tenants/me/conversations/${conversationId}/unread-count`)
      .set('Authorization', `Bearer ${tenantToken}`);
    expect(afterRead.body.data).toBe(0);
  });

  it("rejects an outsider (different org's member) from accessing the conversation", async () => {
    const suffix = Date.now();
    const registerOther = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `chat-outsider-${suffix}@test.com`,
        firstName: 'Out',
        lastName: 'Sider',
        password: 'StrongP@ss1',
        organizationName: `Outsider Org ${suffix}`,
      });
    const outsiderToken = registerOther.body.data.accessToken;
    const outsiderOrgId = registerOther.body.data.organization.id;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${outsiderOrgId}/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect([403, 404]).toContain(res.status);
  });
});
