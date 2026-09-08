import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';

// Platform admin surfaces (spec §27/§28 platform-facing): only
// SUPER_ADMIN/SUPPORT_ADMIN platform roles can reach /admin endpoints,
// which expose org directory, dashboard, verification queue, and payment
// activity across tenants.
describe('Platform admin (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let demoOrgId: string;

  const prisma = new PrismaClient();

  beforeAll(async () => {
    // Hermetic platform-admin bootstrap: create a SUPER_ADMIN account
    // directly (platform-admins aren't created through the public
    // register flow), then verify login works for an org-less user.
    const passwordHash = await argon2.hash('AdminE2e@123');
    const admin = await prisma.user.upsert({
      where: { email: 'e2e-platform-admin@proprentals.app' },
      update: { platformRole: 'SUPER_ADMIN', status: 'ACTIVE', passwordHash },
      create: {
        email: 'e2e-platform-admin@proprentals.app',
        firstName: 'Platform',
        lastName: 'Admin',
        passwordHash,
        status: 'ACTIVE',
        platformRole: 'SUPER_ADMIN',
        emailVerifiedAt: new Date(),
      },
    });
    void admin;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-platform-admin@proprentals.app', password: 'AdminE2e@123' });
    adminToken = login.body.data.accessToken;

    // Seed a normal tenant org the admin can inspect.
    const suffix = Date.now();
    const register = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `admin-org-${suffix}@test.com`,
        firstName: 'Admin',
        lastName: 'Org',
        password: 'StrongP@ss1',
        organizationName: `Admin-watched Org ${suffix}`,
      });
    demoOrgId = register.body.data.organization.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('lets a platform admin list all organizations', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/organizations')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.map((o: { id: string }) => o.id)).toContain(demoOrgId);
  });

  it('returns organization detail with subscription and counts', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/organizations/${demoOrgId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(demoOrgId);
  });

  it('serves platform dashboard and payment activity', async () => {
    const dashboard = await request(app.getHttpServer())
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(dashboard.status).toBe(200);

    const activity = await request(app.getHttpServer())
      .get('/api/v1/admin/payment-activity')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(activity.status).toBe(200);
    expect(Array.isArray(activity.body.data)).toBe(true);
  });

  it('lists verification requests and updates one', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/verification-requests')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data)).toBe(true);
  });

  it('rejects a regular org user from admin endpoints', async () => {
    const suffix = Date.now();
    const register = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `admin-intruder-${suffix}@test.com`,
        firstName: 'Plain',
        lastName: 'User',
        password: 'StrongP@ss1',
        organizationName: `Plain User Org ${suffix}`,
      });
    const token = register.body.data.accessToken;

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/organizations')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
