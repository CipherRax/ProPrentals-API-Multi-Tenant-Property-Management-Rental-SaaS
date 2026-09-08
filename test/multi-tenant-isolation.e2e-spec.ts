import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Proves the single most important security property of the platform
// (spec §63): an authenticated user in Organization A cannot read,
// create under, or otherwise touch Organization B's data — even when
// they know or guess Organization B's real IDs.
describe('Multi-tenant isolation (e2e)', () => {
  let app: INestApplication;

  let orgAToken: string;
  let orgBToken: string;
  let orgBId: string;
  let orgBPropertyId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const suffix = Date.now();

    const registerA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `org-a-${suffix}@test.com`,
        firstName: 'Org',
        lastName: 'A',
        password: 'StrongP@ss1',
        organizationName: `Org A ${suffix}`,
      });
    orgAToken = registerA.body.data.accessToken;

    const registerB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `org-b-${suffix}@test.com`,
        firstName: 'Org',
        lastName: 'B',
        password: 'StrongP@ss1',
        organizationName: `Org B ${suffix}`,
      });
    orgBToken = registerB.body.data.accessToken;
    orgBId = registerB.body.data.organization.id;

    const propertyB = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgBId}/properties`)
      .set('Authorization', `Bearer ${orgBToken}`)
      .send({ name: 'Org B Secret Property', propertyType: 'HOUSE' });
    orgBPropertyId = propertyB.body.data.id;
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

  it('allows Org B to read its own property', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgBId}/properties/${orgBPropertyId}`)
      .set('Authorization', `Bearer ${orgBToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(orgBPropertyId);
  });
});
