<div align="center">

# 🏢 ProPrentals API

**A production-grade, multi-tenant Property Management & Rental SaaS platform**

Modern REST API + real-time WebSockets for landlords, property managers, and tenants —
from tenant onboarding to rent collection, receipts, maintenance, and reporting.

[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-DC382D?logo=redis&logoColor=white)](https://redis.io)
[![M-Pesa](https://img.shields.io/badge/M--Pesa%20Daraja-4CAF50?logo=safari&logoColor=white)](#-payments--mpesa)

[![Tests](https://img.shields.io/badge/tests-58%20passing-22c55e)]()
[![E2E Suites](https://img.shields.io/badge/e2e%20suites-15-22c55e)]()
[![Code Style](https://img.shields.io/badge/code_style-prettier-ff69b4?logo=prettier)]()

</div>

---

## 📖 Table of Contents

- [✨ Features](#-features)
- [🧱 Tech Stack](#-tech-stack)
- [🏗️ Architecture](#️-architecture)
- [📁 Project Structure](#-project-structure)
- [🚀 Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [Running the API](#running-the-api)
- [🔌 API Overview](#-api-overview)
- [🔐 Auth & Multi-Tenancy](#-auth--multi-tenancy)
- [🧪 Testing](#-testing)
- [🤖 Docker](#-docker)
- [🗺️ Roadmap](#️-roadmap)
- [📄 License](#-license)

---

## ✨ Features

> **38 data models**, **30 enums**, and **15 e2e test suites** covering the entire rental lifecycle.

### 🏠 Core Property Management
- **Organizations & RBAC** — owners, property managers, accountants, caretakers, staff, and platform admins with tight role scoping
- **Properties / Buildings / Units** — nested, org-scoped, soft-delete (archive), with photos and amenities
- **Tenant onboarding** — invite → secure single-use token → accept → auto-login; tenant profiles are org-scoped for correct PII isolation

### 💰 Money
- **Rent configuration & generation** — historical pricing, monthly billing, automatic charge + ledger entry generation via **BullMQ** background jobs
- **Double-entry ledger** — *no* stored balance; always computed from append-only `LEDGER` entries (never `balance -= payment`)
- **Payments** — manual recording and **real M-Pesa STK Push** via Safaricom's Daraja API with idempotent callbacks & reconciliation
- **Receipts & statements** — atomic per-payment receipts with collision-free numbering, rendered as **real PDFs** (pdfkit)
- **Security deposits** — auto-created per tenancy, itemized deductions/refunds, settled funds tracked separately from rent

### 🔔 Communication & Engagement
- **Notifications** — in-app inbox + email (SMTP) + SMS (Africa's Talking) with per-user preferences
- **Real-time messaging** — landlord↔tenant chat over **Socket.IO** with presence, typing, and read receipts
- **Announcements** — broadcast to all tenants, a property, a building, or selected units, with scheduled delivery & read receipts

### 🔧 Operations
- **Maintenance requests** — tenant self-service + landlord status lifecycle (open → in-progress → resolved with notes)
- **Public listings & inquiries** — an unauthenticated marketplace where prospective renters browse and contact landlords without exposing org identity
- **Reports & dashboard** — real-time financial, occupancy, and payment-breakdown summaries with **CSV/PDF export**
- **Audit log** — append-only trail on every sensitive action

### 💳 Plans & Monetization
- **4 subscription tiers** (Free / Starter / Business / Enterprise) with **feature flags and hard limits** enforced at the point of creation — e.g. a Free org can own only **1 property**, and Reports require Business+
- **Platform admin** console with org directory, revenue aggregates, verification queue, and payment activity

---

## 🧱 Tech Stack

| Layer       | Technology                                                                 |
| ----------- | -------------------------------------------------------------------------- |
| Runtime     | [Node.js](https://nodejs.org) ≥ 20, [TypeScript](https://www.typescriptlang.org) 5 |
| Framework   | [NestJS](https://nestjs.com) 10                                             |
| Database    | [PostgreSQL](https://www.postgresql.org) 16 via [Prisma](https://www.prisma.io) 5 |
| Cache/Jobs  | [Redis](https://redis.io) + [BullMQ](https://docs.bullmq.io)                 |
| Realtime    | [Socket.IO](https://socket.io) with JWT-authenticated handshake              |
| Auth        | Passport + JWT (rotating refresh tokens, argon2 hashing, lockout)           |
| Payments    | Safaricom [Daraja M-Pesa](https://developer.safaricom.co.ke) (real HTTP)     |
| Validation  | class-validator / class-transformer (strict whitelist)                       |
| Docs        | OpenAPI / Swagger auto-generated                                            |
| Security    | Helmet, CORS, throttling/rate-limit, response envelope, request-id          |
| PDFs        | pdfkit                                                                      |
| Email/SMS   | Nodemailer (SMTP), Africa's Talking (SMS)                                    |

---

## 🏗️ Architecture

```
                    ┌──────────────────────────────────────────────────────┐
                    │                     Clients                          │
                    │   REST (HTTPS)          WebSocket (Socket.IO)        │
                    └───────────┬──────────────────────────┬──────────────┘
                                │                          │
                    ┌───────────▼──────────────────────────▼──────────────┐
                    │                    NestJS Application                │
                    │   Global guards  →  JwtAccessGuard · OrgRolesGuard  │
                    │   RBAC (org + platform roles, resolved server-side) │
                    │   Response envelope · validation · audit log        │
                    ├─────────────────────────────────────────────────────┤
                    │   Auth │ Properties │ Units │ Tenants │ Tenancies   │
                    │   Ledger │ Payments │ M-Pesa │ Receipts │ Deposits  │
                    │   Messaging │ Notifications │ Announcements          │
                    │   Maintenance │ Listings │ Inquiries │ Reports       │
                    │   Subscriptions │ Dashboard │ Admin │ Audit          │
                    ├─────────────────────────────────────────────────────┤
                    │            Background (BullMQ + Redis)              │
                    │   Rent generation · Overdue detection · M-Pesa      │
                    │   reconciliation · Scheduled announcements           │
                    └───────────────────────┬─────────────────────────────┘
                                            │
                    ┌───────────────────────▼─────────────────────────────┐
                    │              PostgreSQL (Prisma ORM)                │
                    │        38 models · 30 enums · soft-deletes          │
                    └─────────────────────────────────────────────────────┘
```

### 🧱 Key design principles

- **Multi-tenant isolation is structural** — every operational record carries an `organizationId`, and every service re-verifies the requesting user's membership against the URL's org before touching data. Org B can never read, list, or write Org A's data, even with Org A's real UUIDs.
- **No stored balances** — balances are always `SUM(DEBIT) - SUM(CREDIT)` over append-only ledger rows (never `balance -= payment`).
- **Payments are idempotent at the DB level** — duplicate M-Pesa callbacks match zero rows and are silently ignored.
- **Deliveries never break financial flows** — email/SMS failures are logged, never thrown, and always run *after* the DB transaction commits.

---

## 📁 Project Structure

```
proprentals/
├── prisma/
│   ├── schema.prisma          # 38 models, 30 enums
│   ├── migrations/            # versioned SQL migrations
│   └── seed.ts                # plans + demo org/owner/property
├── src/
│   ├── common/                # guards, decorators, interceptors, utils
│   ├── auth/                  # JWT, refresh rotation, password reset
│   ├── organizations/         # org + RBAC membership
│   ├── properties/ buildings/ units/
│   ├── tenants/ tenant-invitations/ tenancies/
│   ├── rent-configurations/ rent-charges/ rent-jobs/
│   ├── ledger/                # append-only double-entry
│   ├── payments/ payment-jobs/ mpesa/
│   ├── receipts/ deposits/ pdf/
│   ├── notifications/         # channels + preferences + transactional email
│   ├── messaging/             # REST + WebSocket chat gateway + presence
│   ├── announcements/
│   ├── maintenance/
│   ├── public-listings/ inquiries/
│   ├── subscriptions/ billing/
│   ├── reports/ dashboard/
│   ├── audit/ admin/
│   └── app.module.ts          # root wiring
└── test/                      # 15 e2e suites
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) **≥ 20**
- [PostgreSQL](https://www.postgresql.org) **16** (local, or via Docker)
- [Redis](https://redis.io) **6+**
- A package manager — `npm`

### Installation

```bash
# 1. Clone
git clone https://github.com/CipherRax/ProPrentals-API-Multi-Tenant-Property-Management-Rental-SaaS.git
cd proprentals

# 2. Install dependencies
npm install

# 3. Generate the Prisma client
npx prisma generate
```

### Configuration

Copy the template and fill in the required values:

```bash
cp .env.example .env
```

| Variable                | Required | Description                                    |
| ----------------------- | -------- | ---------------------------------------------- |
| `DATABASE_URL`          | ✅        | PostgreSQL connection string                   |
| `DIRECT_URL`            | ✅        | Direct (non-pooled) connection string          |
| `JWT_ACCESS_SECRET`     | ✅        | Secret for 15-minute access tokens             |
| `JWT_REFRESH_SECRET`    | ✅        | Secret for 30-day rotating refresh tokens      |
| `REDIS_URL`             | ✅        | `redis://localhost:6379` (BullMQ + presence)   |
| `MPESA_*`               | ⏳        | Required only for live M-Pesa (see below)       |
| `SMTP_*` / `AFRICASTALKING_*` | ⏳  | Optional — unset providers log & degrade gracefully |

> 🔒 **Secrets never live in the repo.** Only `.env.example` is committed; `.env` and `.env.*` backups are git-ignored.

### Running the API

```bash
# Apply migrations + seed demo data
npx prisma migrate dev
npm run seed

# Start in watch mode (development)
npm run start:dev

# Start (production build)
npm run build && npm run start:prod
```

Once running:

| Resource            | URL                                   |
| ------------------- | ------------------------------------- |
| Swagger docs        | `http://localhost:3000/docs`          |
| Health check        | `http://localhost:3000/api/v1/health` |

---

## 🔌 API Overview

Every response is wrapped in a consistent envelope, either
`{ success, data }` or `{ success, data, meta }` (paginated), with secure, error-shaped failures.

| Area                    | Example endpoints                                                            |
| ----------------------- | --------------------------------------------------------------------------- |
| **Auth**                | `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh`           |
| **Organizations**       | `GET /organizations/me` · `PATCH /organizations/:id`                        |
| **Properties / Units**  | `POST /organizations/:id/properties` · `POST .../properties/:pid/units`     |
| **Tenants**             | `POST /organizations/:id/tenant-invitations` · `POST /public/tenant-invitations/:token/accept` |
| **Money**               | `POST .../rent-charges/generate-now` · `POST .../payments/manual` · `POST .../payments/mpesa/stk-push` |
| **Ledger**              | `GET .../tenancies/:id/ledger/statement` · `POST .../ledger/entries/:id/reverse` |
| **Receipts**            | `GET .../receipts` · `GET .../receipts/:id/pdf`                              |
| **Deposits**            | `GET .../tenancies/:id/deposit` · `POST .../deposit/process`                |
| **Messaging**           | `POST .../conversations` · `POST .../conversations/:id/messages` · WebSocket `/chat` |
| **Notifications**       | `GET /notifications/me` · `PATCH /notifications/me/preferences`            |
| **Announcements**       | `POST /organizations/:id/announcements` · `GET /tenants/me/announcements`  |
| **Maintenance**         | `POST /tenants/me/tenancies/:id/maintenance` · `PATCH .../maintenance/:id/status` |
| **Public listings**     | `GET /public/listings` · `GET /public/listings/:id` · `POST /inquiries/public` |
| **Subscriptions**       | `GET /subscriptions/plans` · `POST .../subscription/change-plan`            |
| **Reports**             | `GET .../reports/financial` · `GET .../reports/occupancy` · CSV export      |
| **Dashboard / Admin**   | `GET /dashboard` · `GET /admin/organizations` · `GET /admin/dashboard`      |

> 🧭 The full, interactive OpenAPI spec with payloads and schemas is served at `/docs`.

---

## 🔐 Auth & Multi-Tenancy

- **Two-layer RBAC** — a `platformRole` (platform admin/support) plus an org-scoped `role` on `OrganizationMember`. The active org comes from a signed `orgId` claim and is re-verified on every request.
- **Guards** — `JwtAccessGuard` (auth), `OrgRolesGuard` (@OrgRoles), `PlatformRolesGuard` (@PlatformRoles), `@Public()` to opt out.
- **Why tenant profiles are org-scoped** — the same person renting from two landlords gets two profiles, so PII never leaks across orgs even when the underlying account is shared.
- **Invitation security** — 256-bit tokens, only SHA-256 hashes persisted, single-use, expiring, revocable; accepting an invitation never steals an existing account's session.

---

## 🧪 Testing

The project ships with **15 end-to-end suites (58 tests)** that exercise real flows against a real database.

```bash
# Unit tests
npm test

# End-to-end suite (serialized)
npm run test:e2e
```

> ⚙️ Point `DATABASE_URL` at a disposable Postgres instance before running e2e — the suites register real users/orgs/properties/tenancies.

| Suite                          | Covers                                                        |
| ------------------------------ | ------------------------------------------------------------- |
| `multi-tenant-isolation`       | Org A cannot touch Org B's data                               |
| `tenant-invitation-flow`       | Invite → preview → accept → occupancy lifecycle               |
| `rent-generation`              | Idempotent billing, pricing history                           |
| `ledger` / `receipts`          | Append-only entries, PDF receipts & statements                |
| `payments-manual`              | Partial/complete payments → PARTIALLY_PAID / PAID              |
| `deposits`                     | Auto-creation, deductions, settlement                         |
| `notifications` / `messaging`  | In-app delivery, preferences, chat inbox                      |
| `announcements` / `maintenance`| Broadcast + read receipts; maintenance lifecycle              |
| `inquiries-public-listings`    | Marketplace search, anonymous inquiries                       |
| `subscriptions` / `reports`    | Plan limits + feature gating; summary + CSV export            |
| `admin`                        | Platform-admin console + 403 for regular users                |

---

## 🤖 Docker

A multi-stage, Alpine-based `Dockerfile` plus `docker-compose.yml` orchestrate the full stack (Postgres + Redis + API):

```bash
cp .env.example .env
docker compose up --build
```

---

## 🗺️ Roadmap

✅ **Complete** — all feature phases shipped and green:

- [x] Foundation & configuration
- [x] Database / Prisma schema
- [x] Authentication, users/organizations, RBAC
- [x] Properties / buildings / units
- [x] Tenants / invitations / tenancies
- [x] Rent configuration & generation (BullMQ)
- [x] Double-entry ledger
- [x] Payments + real M-Pesa Daraja integration
- [x] Receipts & tenant statements (PDF)
- [x] Security deposits
- [x] Notifications (email / SMS / in-app)
- [x] Real-time messaging (WebSockets)
- [x] Announcements
- [x] Maintenance
- [x] Public listings & inquiries
- [x] Subscriptions & plan enforcement
- [x] Reports
- [x] Dashboard & platform admin
- [x] Audit log & background jobs
- [x] Testing & Docker

⏳ **Planned**

- [ ] Production hardening
- [ ] Ephemeral CI database for e2e
- [ ] Multi-instance presence (socket.io Redis adapter)

---

## 📄 License

UNLICENSED — © 2026 ProPrentals. This project is private software.

---

<div align="center">

**Made for landlords, property managers, and their tenants.** 💙

⭐ If this project helped you, consider giving it a star!

</div>
