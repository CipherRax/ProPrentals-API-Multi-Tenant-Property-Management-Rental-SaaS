import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Public marketplace listings + property inquiries (spec §29–31): listing
// search/detail need no auth, inquiries can be filed against a listed
// unit type by an anonymous visitor, and only the target org can manage them.
describe('Public listings & inquiries (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let organizationId: string;
  let propertyId: string;
  let unitTypeId: string;
  let inquiryId: string;

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
        email: `list-owner-${suffix}@test.com`,
        firstName: 'List',
        lastName: 'Owner',
        password: 'StrongP@ss1',
        organizationName: `List Org ${suffix}`,
      });
    ownerToken = register.body.data.accessToken;
    organizationId = register.body.data.organization.id;

    const property = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Sunlit Court',
        propertyType: 'RESIDENTIAL_BUILDING',
        city: 'Nakuru',
        county: 'Nakuru',
        isPubliclyListable: true,
      });
    propertyId = property.body.data.id;

    const unit = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/properties/${propertyId}/units`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        unitNumber: 'SC-4',
        unitTypeName: 'Two Bedroom',
        baseRent: 20000,
        depositAmount: 20000,
        bedrooms: 2,
        bathrooms: 1,
        isPubliclyListable: true,
      });
    unitTypeId = unit.body.data.unitTypeId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists the unit type publicly with no auth and searchable metadata', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/listings?city=Nakuru');
    expect(res.status).toBe(200);
    const found = res.body.data.find((t: { id: string }) => t.id === unitTypeId);
    expect(found).toBeDefined();
    expect(found.typeName).toBe('Two Bedroom');
    expect(found.property.city).toBe('Nakuru');
  });

  it('never leaks owner/tenant identifiers in a public listing', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/public/listings/${unitTypeId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.organizationId).toBeUndefined();
    expect(res.body.data.property.organizationId).toBeUndefined();
    expect(res.body.data.typeName).toBe('Two Bedroom');
  });

  it('returns marketplace summary totals', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/listings/summary');
    expect(res.status).toBe(200);
    expect(res.body.data.availableUnits).toBeGreaterThanOrEqual(1);
  });

  it('lets an anonymous visitor file an inquiry against the listed unit type', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/inquiries/public').send({
      name: 'Prospective Renter',
      email: 'prospect@example.com',
      phone: '+254700000099',
      message: 'Is this unit still available for October?',
      unitTypeId,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.unitTypeId).toBe(unitTypeId);
    expect(res.body.data.organizationId).toBeUndefined();
    expect(res.body.data.vacantAtInquiry).toBeGreaterThanOrEqual(1);
    inquiryId = res.body.data.id;
  });

  it('target org manages the inquiry status lifecycle', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/v1/inquiries/organizations/${organizationId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.map((i: { id: string }) => i.id)).toContain(inquiryId);

    const update = await request(app.getHttpServer())
      .patch(`/api/v1/inquiries/organizations/${organizationId}/${inquiryId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'CONTACTED' });
    expect(update.status).toBe(200);
    expect(update.body.data.status).toBe('CONTACTED');
  });

  it('rejects an inquiry targeting a type that is not publicly listed', async () => {
    const suffix = Date.now();
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `private-owner-${suffix}@test.com`,
        firstName: 'Private',
        lastName: 'Owner',
        password: 'StrongP@ss1',
        organizationName: `Private Org ${suffix}`,
      });
    const token = reg.body.data.accessToken;
    const orgId = reg.body.data.organization.id;

    const prop = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/properties`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Private Estate', propertyType: 'HOUSE', isPubliclyListable: false });
    const pid = prop.body.data.id;
    const unit = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId}/properties/${pid}/units`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        unitNumber: 'PRV-1',
        unitTypeName: 'Studio',
        baseRent: 5000,
        depositAmount: 5000,
        isPubliclyListable: false,
      });

    const res = await request(app.getHttpServer()).post('/api/v1/inquiries/public').send({
      name: 'Nosey',
      email: 'nosey@example.com',
      message: 'hi',
      unitTypeId: unit.body.data.unitTypeId,
    });
    expect(res.status).toBe(400);
  });
});
