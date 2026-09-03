# ProPrentals API — Multi-Tenant Property Management & Rental SaaS

<<<<<<< HEAD
**Status: Phase 5 of 31 complete** (Foundation + Auth + Org RBAC +
Properties/Buildings/Units + Tenants/Invitations/Tenancies + Rent
Configuration & Generation + The Ledger). See "Roadmap" below for what's
built vs. what's next.

## Phase 5 additions (The Ledger)
=======
**Status: Phase 7 of 31 complete** (Foundation + Auth + Org RBAC +
Properties/Buildings/Units + Tenants/Invitations/Tenancies + Rent
Configuration & Generation + The Ledger + Payments incl. M-Pesa +
Receipts & Tenant Statements). See "Roadmap" below for what's built vs.
what's next.

## Phase 7 additions (Receipts & Tenant Statements)

- Prisma model: `Receipt` — one per successful `Payment` (1:1 via a
  unique `paymentId`), with a `receiptNumber` generated from a new
  `Organization.receiptSequence` counter
- **Receipt numbering is a real atomic guarantee, not careful
  application code**: `receiptSequence` is incremented via Prisma's
  `{ increment: 1 }`, which Postgres executes as a single
  `UPDATE ... SET x = x + 1` — safe under concurrent payments for the
  same organization, no read-then-write race window. The resulting
  `receiptNumber` (e.g. `RCT-GREENV-000001`) also carries its own unique
  constraint as a second layer
- **A receipt cannot be generated twice for the same payment** (spec
  §72 rule 5) — enforced structurally, not just by convention:
  `Payment.receipt` is a 1:1 relation via a unique `paymentId`, so a
  second attempt hits a database constraint rather than silently
  duplicating
- **Receipts are issued atomically, in the same transaction as payment
  confirmation** — for manual payments (`PaymentsService.recordManualPayment`)
  and for M-Pesa (`MpesaPaymentsService.finalizeSuccessfulPayment`). A
  receipt only ever exists alongside a genuinely successful payment,
  never independently of one
- **Real PDF generation with `pdfkit`** (`PdfService`, already a
  dependency since Phase 1, unused until now): both the payment receipt
  and the tenant statement render as actual multi-page PDF documents,
  not HTML-to-PDF or a placeholder
- **PDFs are generated on demand, not stored** — no file is written to
  disk or object storage. This is a deliberate scope boundary: the
  file-storage abstraction (spec §45) isn't built yet, and building a
  one-off storage path just for PDFs felt like the wrong sequencing.
  Every download re-renders from the same underlying data, which also
  means a corrected/reversed ledger entry is always reflected the next
  time a statement is downloaded — there's no stale cached PDF to
  invalidate
- **Tenant statement date filtering** (spec §21): `GET .../ledger/statement/pdf`
  accepts either a `period` shortcut (`CURRENT_MONTH`, `PREVIOUS_MONTH`,
  `CURRENT_YEAR`) or explicit `from`/`to` dates for a custom range —
  built on top of the exact same `LedgerService.buildStatement()` the
  JSON statement endpoint already used since Phase 5, so the numbers in
  the PDF and the JSON response can never disagree with each other
- **A real architectural pattern reused from Phase 6**: PDF download
  endpoints use the `@SkipResponseEnvelope()` decorator (introduced for
  the M-Pesa callback) so raw binary PDF bytes go out with the right
  `Content-Type`/`Content-Disposition` headers, not wrapped in the
  `{success, data}` JSON envelope
- E2E coverage (`test/receipts.e2e-spec.ts`): two manual payments
  produce two receipts with distinct, `RCT-`-prefixed numbers; a receipt
  downloads as a real `application/pdf` response with an `attachment`
  disposition; a tenant statement PDF downloads successfully via the
  `period=CURRENT_MONTH` shortcut

## Phase 6 recap (Payments, including M-Pesa)

- Prisma models: `Payment`, `PaymentAllocation`, plus `PaymentMethod`/
  `PaymentStatus` enums; `RentCharge` gained an `amountPaid` field
- **`RentCharge.status` now actually derives `PAID`/`PARTIALLY_PAID`
  from real money received** — the thing Phase 4/5 explicitly deferred.
  `PaymentsService.allocatePaymentToCharges` is the *only* code path
  that moves a charge into those statuses, and it only runs after a
  payment is confirmed successful (manual payments are confirmed by
  definition; M-Pesa payments only after Daraja's callback says so)
- **Allocation is FIFO by due date**: a payment covers the oldest
  outstanding charge first, then the next, etc.; leftover money beyond
  every outstanding charge becomes an unapplied tenant credit, visible
  in the overall ledger balance rather than force-attached to a specific
  charge (documented simplification — see below)
- **Manual payments** (`POST /tenancies/:id/payments/manual`, spec §19):
  `OWNER`/`PROPERTY_MANAGER`/`ACCOUNTANT` only, recorded as already-
  `SUCCESSFUL` (the landlord is logging money already received), posts
  a `PAYMENT` ledger credit and runs allocation in the same transaction
- **M-Pesa STK Push** (spec §18) via a real Daraja client
  (`MpesaClientService`): OAuth token acquisition (cached in memory
  until near-expiry), STK Push initiation, and STK status query — all
  genuine HTTP calls to Safaricom's API, not mocked responses. Available
  both landlord-initiated (`POST /organizations/:id/tenancies/:id/payments/mpesa/stk-push`)
  and tenant self-service (`POST /tenants/me/tenancies/:id/payments/mpesa/stk-push`)
- **MSISDN normalization** (`common/utils/msisdn.util.ts`): accepts
  `0712...`, `712...`, `+254712...`, `254712...`, and the newer `01...`
  ranges, normalizes all of them to the `2547XXXXXXXX` shape Daraja
  requires
- **The callback is genuinely idempotent, at the DB level**: confirming
  a payment is an atomic `updateMany({ where: { providerCheckoutId,
  status: 'PENDING' } })` — a duplicate/retried Safaricom callback for
  an already-processed payment matches zero rows and is silently
  ignored, never double-posted to the ledger. `providerTransactionId`
  (the M-Pesa receipt number) also carries its own unique constraint as
  a second layer, matching your own stated preference for DB-level
  idempotency over app-layer checks
- **The callback always responds `200`/`ResultCode: 0`**, regardless of
  internal outcome — returning an error here just makes Safaricom retry
  the same callback indefinitely. This required a small but real
  architectural fix: the global response-enveloping interceptor would
  otherwise have wrapped the callback response in `{success, data}`,
  which Safaricom's parser wouldn't recognize. Added a
  `@SkipResponseEnvelope()` decorator, applied only to this endpoint, so
  the rest of the API is unaffected — see `common/interceptors/response.interceptor.ts`
- **Reconciliation sweep** (spec §47's "payment reconciliation"): a
  BullMQ job runs every 5 minutes, actively querying Daraja for the real
  status of any M-Pesa payment stuck `PENDING` for more than 5 minutes
  (callback never arrived), and only gives up and marks it `FAILED`
  after 24 hours of being unable to resolve it either way
- Waiving a rent charge was quietly buggy against this phase's new
  `amountPaid` field until I caught it while wiring payments in: it was
  crediting the charge's *full original amount* regardless of how much
  had already been paid, which would have over-credited a partially-paid
  charge. Fixed — a waiver now only credits the remaining unpaid balance
- E2E coverage (`test/payments-manual.e2e-spec.ts`): a partial manual
  payment produces `PARTIALLY_PAID` with the correct running balance;
  completing it produces `PAID` and a zero balance

### Why M-Pesa can't be verified end-to-end here

`MpesaClientService` makes real HTTP calls to Safaricom's Daraja
sandbox/production API — there's no fake/mocked success path anywhere
in the code, per your own instruction to build the real integration
structure rather than fake business logic. But it genuinely can't be
exercised without: (1) real `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET`
/ `MPESA_SHORTCODE` / `MPESA_PASSKEY` from a Daraja app, and (2) a
publicly reachable `MPESA_CALLBACK_URL` for Safaricom to call back to
(a local dev server isn't reachable from Safaricom's servers — you'd
need something like ngrok for local testing). Once you have both, the
manual test path is: initiate STK Push → approve the prompt on a real
Safaricom line → confirm the callback lands and the ledger/charge update
correctly. Flagging this rather than writing a test that can't actually
run.

### Simplification worth knowing about: unapplied credit isn't attached to a charge

If a payment is larger than everything currently owed, the leftover sits
as a credit visible in the tenant's overall ledger balance (it goes
negative), but isn't force-attached to any specific `RentCharge` as an
`OVERPAID` status. The alternative — inventing a rule for which future
charge absorbs the credit, or marking a past charge `OVERPAID` — felt
more likely to produce a confusing edge case than a useful one. If you'd
rather have next month's charge auto-reduced by any existing credit at
generation time, that's a contained addition to
`RentChargesService.generateNextChargeForTenancy` — flagging it as an
option rather than guessing you want it.

## Phase 5 recap (The Ledger)
>>>>>>> 4ea4411 (PHASE 7: Receipts & Tenant Statements)

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

<<<<<<< HEAD
## What's built in this milestone
=======
## Phase 1 recap (Foundation, Auth, Org RBAC)
>>>>>>> 4ea4411 (PHASE 7: Receipts & Tenant Statements)

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
<<<<<<< HEAD
=======

# Record a manual payment (cash/bank transfer)
curl -X POST http://localhost:3000/api/v1/organizations/<organizationId>/tenancies/<tenancyId>/payments/manual \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"amount": 15000, "method": "CASH", "notes": "Paid at office"}'

# Tenant pays their own rent via M-Pesa STK Push (requires real
# MPESA_* credentials in .env — see README note above)
curl -X POST http://localhost:3000/api/v1/tenants/me/tenancies/<tenancyId>/payments/mpesa/stk-push \
  -H "Authorization: Bearer <tenantAccessToken>" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "0712345678", "amount": 15000}'

# List payments for a tenancy
curl "http://localhost:3000/api/v1/organizations/<organizationId>/payments?tenancyId=<tenancyId>" \
  -H "Authorization: Bearer <accessToken>"

# Tenant checks their own payment history
curl http://localhost:3000/api/v1/tenants/me/payments \
  -H "Authorization: Bearer <tenantAccessToken>"

# List receipts for a tenancy
curl "http://localhost:3000/api/v1/organizations/<organizationId>/receipts?tenancyId=<tenancyId>" \
  -H "Authorization: Bearer <accessToken>"

# Download a receipt as PDF
curl http://localhost:3000/api/v1/organizations/<organizationId>/receipts/<receiptId>/pdf \
  -H "Authorization: Bearer <accessToken>" \
  --output receipt.pdf

# Download a tenant statement as PDF for the current month
curl "http://localhost:3000/api/v1/organizations/<organizationId>/tenancies/<tenancyId>/ledger/statement/pdf?period=CURRENT_MONTH" \
  -H "Authorization: Bearer <accessToken>" \
  --output statement.pdf

# Tenant downloads their own receipt / statement
curl http://localhost:3000/api/v1/tenants/me/receipts/<receiptId>/pdf \
  -H "Authorization: Bearer <tenantAccessToken>" \
  --output receipt.pdf

curl "http://localhost:3000/api/v1/tenants/me/tenancies/<tenancyId>/ledger/statement/pdf?period=PREVIOUS_MONTH" \
  -H "Authorization: Bearer <tenantAccessToken>" \
  --output statement.pdf
>>>>>>> 4ea4411 (PHASE 7: Receipts & Tenant Statements)
```

## Running tests

```bash
npm run test           # unit tests
npm run test:e2e       # includes the multi-tenant isolation proof
```

The e2e suite needs `DATABASE_URL` pointed at a real (ideally disposable)
Postgres instance — it registers real users/orgs/properties/tenancies
against it.

<<<<<<< HEAD
## Architecture notes worth knowing before Phase 6+
=======
## Architecture notes worth knowing before Phase 8+
>>>>>>> 4ea4411 (PHASE 7: Receipts & Tenant Statements)

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
<<<<<<< HEAD
- [ ] 13. Payments
- [ ] 14. M-Pesa
- [ ] 15. Receipts/statements
=======
- [x] 13. Payments
- [x] 14. M-Pesa (real Daraja integration — see README note on why it
      can't be verified end-to-end in this environment)
- [x] 15. Receipts/statements
>>>>>>> 4ea4411 (PHASE 7: Receipts & Tenant Statements)
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

<<<<<<< HEAD
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
=======
## Setup gotchas hit while getting this running (fixed in this milestone)

A few environment issues came up getting Phases 1–6 running from a fresh
clone — all fixed in this codebase now, documented here so a future
fresh clone (or CI setup) doesn't hit them again:

- **Neon's `channel_binding=require`**: Neon's dashboard adds this to
  connection strings by default for `psql`/libpq clients, but Prisma's
  Rust query engine doesn't negotiate it the same way — the TLS
  handshake fails silently and Prisma reports a generic "can't reach
  database server" (P1001), even though raw TCP connectivity is fine.
  Strip `&channel_binding=require` from both `DATABASE_URL` and
  `DIRECT_URL`; `sslmode=require` alone is sufficient.
- **Node version**: `cli-spinners` (pulled in by `@nestjs/cli` watch
  mode) uses `import ... with { type: 'json' }` syntax that requires
  Node 20+. Added `.nvmrc` and an `engines` field to `package.json` so
  this fails loudly with a clear version requirement instead of a
  confusing `SyntaxError` deep in a transitive dependency.
- **`@nestjs/*` packages must all be the same major version.** Running
  `npm install <single-package>@latest` or `npm audit fix --force` on
  just one `@nestjs/*` package (rather than the whole family together)
  silently produces a broken, straddled dependency tree — the peer
  dependency errors this produces don't always make the actual cause
  obvious. All `@nestjs/*` packages here are now pinned to **exact**
  versions (no `^`) on the v10 line specifically so this can't drift
  silently again; upgrade the whole family together and re-test if you
  ever do want to move to v11/v12.
- **`npm audit fix --force` is not safe to run on this project** without
  re-verifying every `@nestjs/*` version afterward, for the reason
  above — it rewrites the dependency tree to satisfy security
  advisories without regard to which packages need to move together.
  Plain `npm audit` (read-only) is fine to run any time.
- **`strictPropertyInitialization`**: disabled in `tsconfig.json`. NestJS
  DTOs are populated at runtime by `class-transformer`, not via a
  constructor, so TypeScript's "property has no initializer" check is a
  false positive on every DTO in the project — this is standard practice
  for NestJS, not a loosening of type safety elsewhere (everything else
  `strict: true` covers is still on).
- **`@types/supertest` was missing** from `devDependencies`, and the
  version that resolves expects a default import
  (`import request from 'supertest'`) rather than the namespace-style
  import (`import * as request from 'supertest'`) — fixed in both
  `package.json` and every `test/*.e2e-spec.ts` file.

## Next up: Phase 8 — Security Deposits

This is where deposits get their own proper tracking (spec §23):
required amount, amount actually paid, outstanding balance, and —
critically — the deductions workflow when a tenancy ends (deduction
reason, amount, date, and which authorized user made the call), all
kept auditable rather than a single mutable "deposit held" number. It's
a natural companion to `TenanciesService.terminate()`, since that's the
point a deposit typically gets processed. Will confirm scope with you
before starting — particularly whether deposit transactions should post
to the same `LedgerEntry` journal as rent (spec's model list keeps them
as separate `SecurityDeposit`/`DepositTransaction` entities, but there's
a reasonable case for at least cross-referencing them from the ledger so
a tenant's full financial picture is visible in one place).
>>>>>>> 4ea4411 (PHASE 7: Receipts & Tenant Statements)
