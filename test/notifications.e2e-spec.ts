import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Proves two things (spec §27/§28): (1) an in-app Notification is
// created when a rent charge is generated, and preferences can be
// read/updated; (2) critically, since this test environment has NO
// real SMTP/Africa's Talking credentials configured, every flow that
// triggers a notification — including password reset, which used to
// just return a token — must still succeed rather than 500ing because
// an unconfigured provider failed. Best-effort delivery must actually
// be best-effort, not "best-effort until the provider errors".
describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let organizationId: string;
  let tenantToken: string;
  let landlordEmail: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const suffix = Date.now();
    landlordEmail = `notif-landlord-${suffix}@test.com`;
    const register = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: landlordEmail,
        firstName: 'Notif',
        lastName: 'Landlord',
        password: 'StrongP@ss1',
        organizationName: `Notif Org ${suffix}`,
      });
    ownerToken = register.body.data.accessToken;
    organizationId = register.body.data.organization.id;

    const property = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Notif Test Property', propertyType: 'HOUSE' });
    const propertyId = property.body.data.id;

    const unit = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/units`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ unitNumber: 'G-1', unitType: 'HOUSE', baseRent: 9000, depositAmount: 9000 });
    const unitId = unit.body.data.id;

    const invite = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/tenant-invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        propertyId,
        unitId,
        tenantFullName: 'Notif Tenant',
        email: `notif-tenant-${suffix}@test.com`,
        proposedRentAmount: 9000,
        proposedDepositAmount: 9000,
        proposedStartDate: new Date().toISOString(),
      });
    // The invitation create call itself attempts email/SMS delivery with
    // no SMTP/Africa's Talking configured — asserting 201 here already
    // proves that failure path doesn't break invitation creation.
    expect(invite.status).toBe(201);

    const accept = await request(app.getHttpServer())
      .post(`/api/v1/public/tenant-invitations/${invite.body.data.rawToken}/accept`)
      .send({ password: 'TenantP@ss1' });
    tenantToken = accept.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an in-app notification when a rent charge is generated', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/rent-charges/generate-now`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const notifications = await request(app.getHttpServer())
      .get('/api/v1/notifications/me')
      .set('Authorization', `Bearer ${tenantToken}`);

    expect(notifications.status).toBe(200);
    const rentDue = notifications.body.data.find((n: { type: string }) => n.type === 'RENT_DUE');
    expect(rentDue).toBeDefined();
    expect(rentDue.readAt).toBeNull();

    const unread = await request(app.getHttpServer())
      .get('/api/v1/notifications/me/unread-count')
      .set('Authorization', `Bearer ${tenantToken}`);
    expect(unread.body.data.unreadCount).toBeGreaterThanOrEqual(1);
  });

  it('marks a notification as read', async () => {
    const notifications = await request(app.getHttpServer())
      .get('/api/v1/notifications/me')
      .set('Authorization', `Bearer ${tenantToken}`);
    const notificationId = notifications.body.data[0].id;

    const markRead = await request(app.getHttpServer())
      .patch(`/api/v1/notifications/me/${notificationId}/read`)
      .set('Authorization', `Bearer ${tenantToken}`);
    expect(markRead.status).toBe(200);
    expect(markRead.body.data.readAt).not.toBeNull();
  });

  it('returns default preferences (everything enabled) and allows updating them', async () => {
    const defaults = await request(app.getHttpServer())
      .get('/api/v1/notifications/me/preferences')
      .set('Authorization', `Bearer ${tenantToken}`);
    expect(defaults.status).toBe(200);
    expect(defaults.body.data.length).toBeGreaterThan(0);
    expect(
      defaults.body.data.every((p: { emailEnabled: boolean }) => p.emailEnabled === true),
    ).toBe(true);

    const update = await request(app.getHttpServer())
      .patch('/api/v1/notifications/me/preferences')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        category: 'RENT_REMINDERS',
        inAppEnabled: true,
        emailEnabled: false,
        smsEnabled: false,
      });
    expect(update.status).toBe(200);
    expect(update.body.data.emailEnabled).toBe(false);
  });

  it('does not fail the forgot-password flow even with no SMTP configured', async () => {
    // This is the critical regression check: TransactionalEmailService
    // must swallow the "SMTP not configured" failure internally rather
    // than letting it bubble up as a 500 — and it must never reveal
    // whether the email exists via a different response shape either.
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: landlordEmail });
    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain('If that email exists');

    const resUnknown = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'definitely-not-registered@test.com' });
    expect(resUnknown.status).toBe(200);
    expect(resUnknown.body.data.message).toBe(res.body.data.message);
  });
});
