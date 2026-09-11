import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Unit-type stock model (spec §38–47): one public card per
// UnitTypeDefinition with live vacancy, soft-holds on inquiry conversion,
// stepper + sync for AUTO/MANUAL, and cross-org isolation.
describe('Unit-type stock model (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let organizationId: string;
  let propertyId: string;
  let manualTypeId: string;
  let autoUnitId: string;
  let autoTypeId: string;
  let inquiryId: string;

  const expectCreated = (res: request.Response, what: string) => {
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
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
    const register = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `stock-owner-${suffix}@test.com`,
        firstName: 'Stock',
        lastName: 'Owner',
        password: 'StrongP@ss1',
        organizationName: `Stock Org ${suffix}`,
      });
    ownerToken = register.body.data.accessToken;
    organizationId = register.body.data.organization.id;

    const property = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Stock Tower',
        propertyType: 'RESIDENTIAL_BUILDING',
        city: 'Nairobi',
        county: 'Nairobi',
        isPubliclyListable: true,
      });
    propertyId = property.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a MANUAL unit type with declared stock via the stepper endpoint', async () => {
    const createRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/unit-types`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        typeName: 'Studio',
        baseRent: 12000,
        depositAmount: 12000,
        trackingMode: 'MANUAL',
        totalCount: 5,
        vacantCount: 5,
        isPubliclyListable: true,
      });
    expectCreated(createRes, 'create manual type');
    manualTypeId = createRes.body.data.id;
    expect(createRes.body.data.trackingMode).toBe('MANUAL');
    expect(createRes.body.data.totalCount).toBe(5);
  });

  it('lists unit types for the property', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/properties/${propertyId}/unit-types`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { id: string }) => t.id)).toContain(manualTypeId);
  });

  it('gets a single unit type with vacancy info', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/properties/${propertyId}/unit-types/${manualTypeId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.vacantCount).toBeGreaterThanOrEqual(0);
    expect(res.body.data.trackingMode).toBe('MANUAL');
  });

  it('adjusts MANUAL vacancy via stepper (decrement)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/unit-types/${manualTypeId}/vacancy`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ delta: -3 });
    expect(res.status).toBe(201);
    expect(res.body.data.after).toBe(2);
  });

  it('rejects stepper decrement below zero (409)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/unit-types/${manualTypeId}/vacancy`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ delta: -3 });
    expect(res.status).toBe(409);
  });

  it('rejects stepper increment above totalCount (409)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/unit-types/${manualTypeId}/vacancy`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ delta: 10 });
    expect(res.status).toBe(409);
  });

  it('adjusts MANUAL vacancy via stepper (increment)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/unit-types/${manualTypeId}/vacancy`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ delta: 1 });
    expect(res.status).toBe(201);
    expect(res.body.data.after).toBe(3);
  });

  it('creates an AUTO unit type via a physical unit with unitTypeName', async () => {
    const unit = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/units`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        unitNumber: 'AUTO-1',
        unitTypeName: 'Chalet',
        baseRent: 25000,
        depositAmount: 25000,
        isPubliclyListable: true,
      });
    expectCreated(unit, 'create auto unit');
    autoUnitId = unit.body.data.id;
    autoTypeId = unit.body.data.unitTypeId;
  });

  it('AUTO type derives vacancy from physical units', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/properties/${propertyId}/unit-types/${autoTypeId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.trackingMode).toBe('AUTO');
    expect(res.body.data.totalCount).toBe(1);
    expect(res.body.data.vacantCount).toBe(1);
  });

  it('rejects stepper adjustment on AUTO type (400)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/unit-types/${autoTypeId}/vacancy`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ delta: -1 });
    expect(res.status).toBe(400);
  });

  it('bulk vacancy skips AUTO types and reports', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/unit-types/vacancy-bulk`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ items: [
        { unitTypeId: manualTypeId, delta: 1 },
        { unitTypeId: autoTypeId, delta: 1 },
      ] });
    expect(res.status).toBe(201);
    const updated = res.body.data.applied.find((r: { unitTypeId: string }) => r.unitTypeId === manualTypeId);
    expect(updated.after).toBe(4);
    const skipped = res.body.data.skipped.some((r: { unitTypeId: string }) => r.unitTypeId === autoTypeId);
    expect(skipped).toBe(true);
  });

  it('public marketplace shows one card per type (not per physical unit)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/listings?limit=50');
    expect(res.status).toBe(200);
    const myCards = res.body.data.filter((t: { property: { id: string } }) => t.property.id === propertyId);
    const studioCards = myCards.filter((t: { typeName: string }) => t.typeName === 'Studio');
    const chaletCards = myCards.filter((t: { typeName: string }) => t.typeName === 'Chalet');
    expect(studioCards).toHaveLength(1);
    expect(chaletCards).toHaveLength(1);
    expect(studioCards[0].vacantCount).toBe(4);
    expect(studioCards[0].totalCount).toBe(5);
    expect(chaletCards[0].vacantCount).toBe(1);
  });

  it('fully-booked type hidden by default, shown with includeUnavailable', async () => {
    // Drive studio vacant to 0
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/unit-types/${manualTypeId}/vacancy`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ delta: -4 });

    // Unique search key busts the 30s in-memory marketplace cache so this
    // run observes the freshly-synced vacancy.
    const withoutFlag = await request(app.getHttpServer()).get('/api/v1/public/listings?search=Studio&limit=50');
    const hidden = withoutFlag.body.data.find((t: { id: string }) => t.id === manualTypeId);
    expect(hidden).toBeUndefined();

    const withFlag = await request(app.getHttpServer()).get('/api/v1/public/listings?search=Studio&limit=50&includeUnavailable=true');
    const shown = withFlag.body.data.find((t: { id: string }) => t.id === manualTypeId);
    expect(shown).toBeDefined();
    expect(shown.vacantCount).toBe(0);

    // Restore vacancy for later tests
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/unit-types/${manualTypeId}/vacancy`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ delta: 2 });
  });

  it('public listing detail shows unit type info without org/tenant data', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/public/listings/${manualTypeId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.organizationId).toBeUndefined();
    expect(res.body.data.property.organizationId).toBeUndefined();
    expect(res.body.data.trackingMode).toBe('MANUAL');
    expect(res.body.data.vacantCount).toBeGreaterThanOrEqual(0);
  });

  it('files an inquiry against a unit type with vacantAtInquiry snapshot', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/inquiries/public').send({
      name: 'Stock Renter',
      email: 'stock.renter@example.com',
      phone: '+254700000088',
      message: 'Is the Studio still available?',
      unitTypeId: manualTypeId,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.unitTypeId).toBe(manualTypeId);
    expect(res.body.data.vacantAtInquiry).toBe(2);
    inquiryId = res.body.data.id;
  });

  it('converting an inquiry acquires a 30-min hold and decrements vacancy', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/inquiries/organizations/${organizationId}/${inquiryId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'CONVERTED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CONVERTED');
    expect(res.body.data.reservedAt).toBeDefined();

    const type = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/properties/${propertyId}/unit-types/${manualTypeId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(type.body.data.vacantCount).toBe(1);
  });

  it('holds block a second CONVERTED inquiry when fully booked', async () => {
    // Drive vacant to 0 (hold + 1 extra decrement = 0)
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/unit-types/${manualTypeId}/vacancy`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ delta: -1 });

    // New inquiry at 0 vacant
    const inq = await request(app.getHttpServer()).post('/api/v1/inquiries/public').send({
      name: 'Late Renter',
      email: 'late@example.com',
      message: 'Any chance?',
      unitTypeId: manualTypeId,
    });
    expect(inq.status).toBe(201);

    const convertRes = await request(app.getHttpServer())
      .patch(`/api/v1/inquiries/organizations/${organizationId}/${inq.body.data.id}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'CONVERTED' });
    expect(convertRes.status).toBe(409);
  });

  it('explicit releaseHold endpoint frees the held slot', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/inquiries/organizations/${organizationId}/${inquiryId}/release-hold`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(201);

    const type = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/properties/${propertyId}/unit-types/${manualTypeId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(type.body.data.vacantCount).toBe(1);
  });

  it('returns 403 when fetching a unit type from another org', async () => {
    const suffix = Date.now();
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `stock-other-${suffix}@test.com`,
        firstName: 'Other',
        lastName: 'Org',
        password: 'StrongP@ss1',
        organizationName: `Other Org ${suffix}`,
      });
    const otherToken = reg.body.data.accessToken;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/properties/${propertyId}/unit-types/${manualTypeId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 when fetching a non-existent unit type', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/properties/${propertyId}/unit-types/${fakeId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });

  it('archive a unit increments AUTO vacancy', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/organizations/${organizationId}/properties/${propertyId}/units/${autoUnitId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);

    const type = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/properties/${propertyId}/unit-types/${autoTypeId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(type.body.data.totalCount).toBe(0);
    expect(type.body.data.vacantCount).toBe(0);
  });
});
