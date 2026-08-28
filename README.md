# ProPrentals API — Multi-Tenant Property Management & Rental SaaS

**Status: Phase 5 of 31 complete** (Foundation + Auth + Org RBAC +
Properties/Buildings/Units + Tenants/Invitations/Tenancies + Rent
Configuration & Generation + The Ledger). See "Roadmap" below for what's
built vs. what's next.

## Phase 5 additions (The Ledger)

- Prisma model: `LedgerEntry` — append-only, `LedgerEntryType`
  (`RENT_CHARGE`, `PAYMENT`, `REFUND`, `LATE_FEE`, `CREDIT_ADJUSTMENT`,
  `DEBIT_ADJUSTMENT`, `WAIVER`) and `LedgerEntryDirection`
  (`DEBIT`/`CREDIT`) enums
- **There is no balance column anywhere.** A tenancy's balance is
  `SUM(DEBIT) - SUM(CREDIT)` over its `LedgerEntry` rows, computed fresh
  on every read in `LedgerService.getBalance()` /
  `LedgerService.buildStatement()` — never cached, never stored, never
  mutated directly. This is the literal implementation of spec §73's
  "never `tenant.balance = tenant.balance - payment`" rule
- **Rent charges and their ledger entries are created atomically,
  together, always.** `RentChargesService.generateNextChargeForTenancy`
  now wraps the `RentCharge` insert and its `RENT_CHARGE` debit entry in
  one transaction — there is no code path that creates one without the
  other
- **Waiving a charge posts an offsetting credit, it never edits the
  original debit.** The `RentCharge` row still shows the original
  amount and a `WAIVED` status; the ledger shows both the original debit
  and the waiver's credit, netting to zero. History stays intact and
  auditable either way you look at it
- **Manual adjustments** (`POST /ledger/adjustments`, `OWNER`/
  `PROPERTY_MANAGER`/`ACCOUNTANT`) for one-off credits or debits that
  don't fit a rent charge, always with a required reason
- **Reversal, not deletion**: `POST /ledger/entries/:id/reverse` posts a
  new entry with the opposite direction and a `reversesEntryId` pointer
  back to the original — the original row is never touched. A DB-level
  unique constraint on `reversesEntryId` means a given entry can only be
  reversed once; a second attempt gets a 409, not a silent double-credit.
  Only manual adjustments are reversible through this endpoint —
  system-generated entries (`RENT_CHARGE`, `WAIVER`) go through their own
  domain actions (waiving a charge) so the ledger can't drift out of
  sync with `RentCharge.status`
- Per-tenancy statement endpoint (`GET /ledger/statement`) returns
  opening balance, a running balance per entry, and closing balance for
  a date range — the actual data spec §21's PDF tenant statements will
  render from once PDF generation is wired up
- Tenant self-service: `GET /tenants/me/tenancies/:id/ledger/statement`
- E2E coverage (`test/ledger.e2e-spec.ts`): generated charge shows as a
  debit → waiving it nets the balance to zero via an offsetting credit,
  never an edit → manual adjustment and its reversal round-trip the
  balance back to zero while the entry count only ever grows → a second
  reversal attempt on the same entry is rejected

## Phase 4 recap (Rent Configuration & Rent Generation)

- Prisma models: `RentConfiguration` (historically-traceable rent
  pricing per tenancy, spec §13) and `RentCharge` (one row per billing
  period, spec §14), plus a `RentChargeStatus` enum
- **BullMQ/Redis is now actually wired up** (`@nestjs/bullmq`,
  registered globally in `app.module.ts` off `REDIS_URL`) — this is the
  first phase that needed a real background job rather than pure
  request/response
- **Cron only decides *when*, BullMQ does the work** (spec §47 vs §48):
  `RentSchedulerService` runs two `@Cron` jobs daily (generate charges,
  detect overdue) that each enqueue a BullMQ job; `RentProcessor` (a
  `WorkerHost`) does the actual database work. This split means job
  failures get BullMQ's retry/logging behavior for free, and the worker
  could be moved to a separate process later without touching the
  scheduling logic
- **Rent generation is idempotent at three layers**: a
  `(tenancyId, billingPeriodStart)` unique constraint (source of truth —
  a duplicate insert attempt is caught and treated as a no-op, not an
  error), a date-based BullMQ `jobId` (so the same day's cron run can't
  double-queue), and the generation logic itself only creates a charge
  once its billing period has actually started. Covered by
  `test/rent-generation.e2e-spec.ts`, which calls the manual trigger
  endpoint twice and asserts exactly one charge exists
- **Rent pricing history is real, not just a comment**: every `Tenancy`
  gets its first `RentConfiguration` created atomically alongside it
  (see `TenanciesService.createTenancyWithinTransaction`); raising rent
  later closes the old configuration's `effectiveTo` and inserts a new
  row rather than mutating the amount in place — you can always answer
  "what was the rent in March?"
- Manual trigger endpoint (`POST /organizations/:id/rent-charges/generate-now`,
  `OWNER`-only) runs the *exact same code path* as the nightly cron, for
  local testing without waiting a day
- Waiving a charge (`PATCH /rent-charges/:id/waive`) is deliberately the
  only manual status transition available in this phase — `PAID` /
  `PARTIALLY_PAID` / `OVERPAID` are intentionally **not** settable here

### Why RentCharge.status doesn't do everything yet

Spec §16 lists a fuller status set (`PAID`, `PARTIALLY_PAID`,
`PAYMENT_PENDING`, `OVERPAID`, ...) than what's implemented now
(`UNPAID`, `OVERDUE`, `WAIVED`, `CANCELLED`, plus `PARTIALLY_PAID`/`PAID`
reserved but unused). That's intentional, not an oversight: spec §73 is
explicit that a payment status must be *derived from actual ledger/
payment records*, never hand-maintained as the source of truth. Setting
`PAID` here without a real Ledger or Payment behind it would be exactly
the anti-pattern the spec warns against (`tenant.balance = tenant.balance
- payment`, but for status instead of balance). The Ledger phase (next)
is where a charge's real-time status gets computed from its actual
payment history, and this phase's `RentCharge` rows are what it computes
that status *from*.

### Simplification worth knowing about: billing periods are start-date-anchored

Billing periods run in N-month increments from the tenancy's actual
`startDate` (e.g. start Jan 17 → periods are Jan 17–Feb 17, Feb 17–Mar
17, ...) rather than snapping to calendar-month boundaries. This avoids
prorating a partial first period, which is simpler but means "this
month's rent" isn't always the 1st–end-of-month. If you'd rather have
calendar-month-aligned periods with a prorated first charge, that's a
contained change in `common/utils/billing-period.util.ts` — flagging it
now rather than guessing which you'd prefer.

## Phase 3 recap (Tenants / Invitations / Tenancies)

- Prisma models: `TenantProfile` (org-scoped tenant identity — see note
  below), `TenantInvitation`, `Tenancy`, plus `TenantProfileStatus`,
  `InvitationStatus`, `BillingFrequency`, `TenancyStatus` enums
- **Secure invitation tokens** (spec §11): 256-bit random token, only its
  SHA-256 hash is ever persisted, single-use (atomically claimed via a
  conditional `updateMany` so two concurrent accept calls can't both
  succeed), expiring (default 7 days, configurable per invitation),
  revocable by the landlord while still `PENDING`
- **Public preview endpoint** (`GET /public/tenant-invitations/:token`)
  returns only what's needed to decide whether to accept — property
  name/location, unit type, proposed rent — and deliberately omits every
  internal ID
- **Public accept endpoint** creates the tenant's `User` + `TenantProfile`
  + `Tenancy` in a single transaction and auto-logs them in — *except*
  when an account already exists for that email, in which case it links
  the tenant profile but does **not** issue a session (see security note
  below)
- **Occupancy is now actually derived, not hand-set**: creating an active
  tenancy sets `Unit.availabilityStatus = OCCUPIED`; terminating one sets
  it back to `VACANT`. This logic lives in one place
  (`TenanciesService.createTenancyWithinTransaction` /
  `TenanciesService.terminate`) and is reused by both the direct
  tenancy-creation endpoint and the invitation-acceptance flow — so there
  is exactly one code path that ever touches unit occupancy state
- **One active/pending tenancy per unit, enforced in the same transaction**
  as tenancy creation (spec §72 rule 1) — see note on a follow-up DB-level
  safety net below
- Tenant self-service endpoints under `/tenants/me/...` (profile, current
  tenancies) — deliberately *not* nested under `/organizations/:id`,
  since a tenant is not an `OrganizationMember` and shouldn't need to
  know an organization ID to see their own data
- E2E tests: full invite → preview → accept → occupied-unit lifecycle,
  single-use enforcement, and cross-organization invitation rejection

### Security note: why accepting an invitation doesn't always log you in

Right now (before the Notifications phase wires up real email/SMS
delivery), the raw invitation token is returned directly in the API
response to whoever created the invitation — there's no out-of-band
delivery channel yet. That's fine for a legitimate landlord relaying the
link to their tenant, but it means anyone who can create an invitation
(any `OWNER`/`PROPERTY_MANAGER` in *any* organization) can generate a
valid token for *any* email address, including one that already has a
ProPrentals account.

If acceptance always auto-issued a session for the invited email, that
would be an account-takeover primitive: Org X's owner invites
`victim@example.com` (who already has an account from using the
platform as a tenant of Org Y), gets the token back, calls accept, and
would be logged in as the victim.

The fix: if an account already exists for the invited email, `accept`
links the `TenantProfile` and creates the `Tenancy` (the legitimate
landlord workflow — inviting a real tenant who happens to already have
an account still works), but responds with `requiresLogin: true` and no
tokens. The victim scenario above still results in an unwanted org
membership record, not a stolen session — annoying if abused, not a
takeover. Once real email/SMS delivery lands, this can likely be relaxed
somewhat since the token would only ever reach the actual inbox owner,
but I'd want to revisit it deliberately rather than reopen it silently.

### Design note: why TenantProfile is org-scoped, not global

A `TenantProfile` belongs to one `Organization`, even though the
underlying `User` account is global. The same person renting from two
unrelated landlords on the platform gets two separate `TenantProfile`
rows — this keeps tenant PII (ID numbers, emergency contacts, address)
correctly scoped per landlord relationship and means Org A's
`TenantProfile` for someone never accidentally surfaces in Org B's
tenant directory, even if they share a `User.email`.

### Follow-up worth doing before production: partial unique index

"One active/pending tenancy per unit" is enforced today at the
application layer, inside the same transaction that creates the
tenancy, which closes the practical race window. For defense-in-depth
you may want to add a Postgres partial unique index as a hard DB-level
backstop once you're comfortable hand-editing a generated migration:

```sql
CREATE UNIQUE INDEX one_active_or_pending_tenancy_per_unit
  ON tenancies ("unitId")
  WHERE status IN ('ACTIVE', 'PENDING');
```

Prisma's schema DSL doesn't support partial unique indexes directly, so
this would go into a migration's `.sql` file by hand (or via
`prisma db execute`) rather than the schema itself — flagging it rather
than silently adding a raw-SQL migration file without your sign-off.

## Phase 2 recap (Properties / Buildings / Units)
  with `PropertyType`, `PropertyStatus`, `VerificationStatus`, `UnitType`,
  `UnitAvailabilityStatus` enums
- Nested, org-scoped REST routes:
  `/organizations/:organizationId/properties`,
  `/organizations/:organizationId/properties/:propertyId/buildings`,
  `/organizations/:organizationId/properties/:propertyId/units`
  (+ `/images` sub-routes on properties and units)
- Every read/write re-verifies `OrganizationMember` for the URL's
  `organizationId` before touching anything — this is the actual
  multi-tenant isolation boundary, enforced in `assertMembership()` and
  re-used from `properties.service.ts`, `buildings.service.ts`,
  `units.service.ts`
- Manage actions (create/update/delete) restricted to `OWNER` /
  `PROPERTY_MANAGER`; other org roles get read access
- Soft-delete (archive) instead of hard delete on properties/buildings/
  units, per spec §54
- **Availability vs. occupancy kept separate on purpose** (spec §9):
  `Unit.availabilityStatus` cannot be manually set to/from `OCCUPIED` —
  that value is now derived from active `Tenancy` records as of Phase 3
  (see above). Trying to set it manually via the units API still returns
  a clear 400 rather than a silent no-op.
- Pagination (`page`, `limit`, `search`, `sortOrder`) standardized via
  `PaginationQueryDto` / `buildPaginatedResult()` in `common/` — every
  future list endpoint reuses these instead of reinventing pagination
- Multi-tenant isolation e2e test (`test/multi-tenant-isolation.e2e-spec.ts`)
  proving Org A cannot read, list, or write into Org B's organization or
  properties even when it has Org B's real UUIDs (spec §63)

## What's built in this milestone

- NestJS + TypeScript (strict mode) project scaffold
- Prisma schema: `User`, `Organization`, `OrganizationMember` (RBAC join),
  `StaffInvitation`, `RefreshToken`, `PasswordResetToken`,
  `EmailVerificationToken`, `AuditLog`
- Auth: register (creates org + OWNER membership in one transaction),
  login, refresh (rotating tokens), logout, logout-all, change-password,
  forgot/reset-password — all with argon2 hashing, account lockout after
  5 failed attempts, and audit logging
- RBAC scaffolding: `JwtAccessGuard`, `OrgRolesGuard`, `PlatformRolesGuard`,
  `@Public()`, `@OrgRoles()`, `@PlatformRoles()`, `@CurrentUser()` — org
  context is always resolved server-side from `OrganizationMember`, never
  trusted from client input
- Global request pipeline: helmet, CORS, `ValidationPipe` (whitelist +
  transform), consistent `{ success, data }` / `{ success, data, meta }`
  response envelope, consistent error envelope, request-id tagging
- Global rate limiting (`@nestjs/throttler`) with tighter overrides on
  auth endpoints
- Swagger at `/docs`
- Health check at `/api/v1/health`
- Docker: multi-stage Alpine `Dockerfile` (openssl installed for Prisma),
  `docker-compose.yml` with Postgres + Redis + API
- `.env.example` covering all documented env vars for later phases
  (M-Pesa, SMTP, SMS, storage) even though those integrations aren't
  wired up yet
- Seed script: platform super admin + demo landlord org/owner

## Getting started

```bash
cp .env.example .env
# fill in DATABASE_URL, DIRECT_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET at minimum
# REDIS_URL defaults to redis://localhost:6379 — a running Redis is now
# required (Phase 4 wires up real BullMQ background jobs)

npm install
npx prisma generate
npx prisma migrate dev --name init
npm run seed

npm run start:dev
```

Or via Docker:

```bash
cp .env.example .env
docker compose up --build
```

Swagger UI: `http://localhost:3000/docs`
Health check: `http://localhost:3000/api/v1/health`

## Try it

```bash
# Register (creates a user + their organization + OWNER membership)
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane@example.com",
    "firstName": "Jane",
    "lastName": "Doe",
    "password": "StrongP@ss1",
    "organizationName": "Green Valley Rentals"
  }'

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "jane@example.com", "password": "StrongP@ss1"}'

# Get my profile (use accessToken from login response)
curl http://localhost:3000/api/v1/users/me \
  -H "Authorization: Bearer <accessToken>"

# List my organizations
curl http://localhost:3000/api/v1/organizations/me \
  -H "Authorization: Bearer <accessToken>"

# Create a property (use organizationId from the register/login response)
curl -X POST http://localhost:3000/api/v1/organizations/<organizationId>/properties \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Green Valley Apartments", "propertyType": "APARTMENT_COMPLEX", "city": "Nairobi", "county": "Nairobi"}'

# Add a building to it
curl -X POST http://localhost:3000/api/v1/organizations/<organizationId>/properties/<propertyId>/buildings \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Block A", "floors": 4}'

# Add a unit
curl -X POST http://localhost:3000/api/v1/organizations/<organizationId>/properties/<propertyId>/units \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"buildingId": "<buildingId>", "unitNumber": "A-101", "unitType": "ONE_BEDROOM", "bedrooms": 1, "bathrooms": 1, "baseRent": 15000, "depositAmount": 15000}'

# List units with pagination/filtering
curl "http://localhost:3000/api/v1/organizations/<organizationId>/properties/<propertyId>/units?page=1&limit=20&availabilityStatus=VACANT" \
  -H "Authorization: Bearer <accessToken>"

# Invite a tenant to a unit (landlord side)
curl -X POST http://localhost:3000/api/v1/organizations/<organizationId>/tenant-invitations \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "propertyId": "<propertyId>",
    "unitId": "<unitId>",
    "tenantFullName": "John Kamau",
    "email": "john.kamau@example.com",
    "proposedRentAmount": 15000,
    "proposedDepositAmount": 15000
  }'
# → response includes { rawToken, invitationLink } — relay this to the
#   tenant yourself for now; automatic delivery lands in the
#   Notifications phase.

# Tenant previews the invitation (public, no auth)
curl http://localhost:3000/api/v1/public/tenant-invitations/<rawToken>

# Tenant accepts (public, no auth) — creates their account + tenancy,
# and logs them straight in (unless an account already existed for that
# email — see README security note above)
curl -X POST http://localhost:3000/api/v1/public/tenant-invitations/<rawToken>/accept \
  -H "Content-Type: application/json" \
  -d '{"password": "TenantP@ss1"}'

# Tenant checks their own tenancy
curl http://localhost:3000/api/v1/tenants/me/tenancies \
  -H "Authorization: Bearer <tenantAccessToken>"

# Manually trigger rent generation (owner only — no need to wait for the
# nightly cron during local dev/testing)
curl -X POST http://localhost:3000/api/v1/organizations/<organizationId>/rent-charges/generate-now \
  -H "Authorization: Bearer <accessToken>"

# List generated rent charges
curl "http://localhost:3000/api/v1/organizations/<organizationId>/rent-charges?status=UNPAID" \
  -H "Authorization: Bearer <accessToken>"

# Raise the rent on a tenancy, effective a future date — this closes the
# old RentConfiguration and inserts a new one; it never overwrites history
curl -X POST http://localhost:3000/api/v1/organizations/<organizationId>/tenancies/<tenancyId>/rent-configurations \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"amount": 17000, "effectiveFrom": "2026-07-01"}'

# Tenant checks their own rent charges
curl http://localhost:3000/api/v1/tenants/me/rent-charges \
  -H "Authorization: Bearer <tenantAccessToken>"

# View a tenancy's full ledger statement (opening/closing balance +
# running balance per entry)
curl http://localhost:3000/api/v1/organizations/<organizationId>/tenancies/<tenancyId>/ledger/statement \
  -H "Authorization: Bearer <accessToken>"

# Post a manual adjustment (e.g. a goodwill credit)
curl -X POST http://localhost:3000/api/v1/organizations/<organizationId>/tenancies/<tenancyId>/ledger/adjustments \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"kind": "CREDIT", "amount": 500, "reason": "Goodwill credit for delayed maintenance"}'

# Reverse a manual adjustment (posts an offsetting entry, never deletes)
curl -X POST http://localhost:3000/api/v1/organizations/<organizationId>/tenancies/<tenancyId>/ledger/entries/<entryId>/reverse \
  -H "Authorization: Bearer <accessToken>"

# Tenant checks their own ledger statement
curl http://localhost:3000/api/v1/tenants/me/tenancies/<tenancyId>/ledger/statement \
  -H "Authorization: Bearer <tenantAccessToken>"
```

## Running tests

```bash
npm run test           # unit tests
npm run test:e2e       # includes the multi-tenant isolation proof
```

The e2e suite needs `DATABASE_URL` pointed at a real (ideally disposable)
Postgres instance — it registers real users/orgs/properties/tenancies
against it.

## Architecture notes worth knowing before Phase 6+

- **Tenant isolation boundary**: every operational record from Phase 3
  onward (`Property`, `Unit`, `Tenancy`, `Payment`, ...) will carry
  `organizationId`, and every service method will call
  `OrganizationsService.assertMembership(userId, organizationId)` (or an
  equivalent Prisma `where` clause scoped to it) before touching data —
  the same pattern already used in `organizations.service.ts`.
- **RBAC is two-layered**: `platformRole` (nullable, only set for
  Anthropic-side... sorry, *platform*-side staff) vs. org-scoped `role`
  on `OrganizationMember`. A user can be a member of multiple orgs with
  different roles in each — the active org for a request comes from the
  `orgId` claim embedded in the access token at login/switch-org time,
  re-verified against `OrganizationMember` on every request in
  `JwtAccessStrategy.validate()`.
- **Refresh tokens rotate**: each refresh call revokes the old token and
  issues a new pair, tracked via `replacedBy` — lets you detect reuse of
  a revoked token later if you want to add breach detection.
- **Prisma transaction timeout is already raised to 15s** in
  `prisma.service.ts`, and `binaryTargets` already includes the
  linux-musl variants for Alpine, per the lessons from SokoMkononi.

## Roadmap (from the spec's phase order)

- [x] 1. Project foundation
- [x] 2. Configuration
- [x] 3. Database/Prisma (core entities so far)
- [x] 4. Authentication
- [x] 5. Users/organizations
- [x] 6. RBAC/permissions (role-based, confirmed — no granular permission
      table; `OrganizationMember.role` enum is the source of truth)
- [x] 7. Properties/buildings/units
- [x] 8. Tenants/invitations
- [x] 9. Tenancies
- [x] 10–11. Rent configuration, rent generation
- [x] 12. Ledger
- [ ] 13. Payments
- [ ] 14. M-Pesa
- [ ] 15. Receipts/statements
- [ ] 16. Security deposits
- [ ] 17–19. Notifications, messaging, announcements
- [ ] 20. Maintenance
- [ ] 21–23. Public listings, inquiries
- [ ] 24–25. Subscriptions, platform billing
- [ ] 26–27. Reports, audit logs (audit log infra already in place)
- [x] 28. Background jobs (BullMQ now in real use for rent generation +
      overdue detection; more jobs land as later phases need them)
- [ ] 29. Testing
- [x] 30. Docker (base setup; will extend as new services are added)
- [ ] 31. Production hardening

## Next up: Phase 6 — Payments (including M-Pesa)

This is where a `Payment` model finally exists for `PAYMENT` ledger
entries to reference, `RentCharge.status` starts computing real
`PAID`/`PARTIALLY_PAID`/`OVERPAID` values from actual payment
allocations against charges, and M-Pesa STK Push gets wired up as the
first payment provider behind a provider abstraction (spec §17–18).
Manual payments (cash/bank transfer, recorded by an authorized
landlord/accountant) land in the same phase since they share the same
ledger-posting logic. Will confirm scope — particularly whether you want
to supply real Daraja sandbox credentials before or after the provider
abstraction is built — before starting.
