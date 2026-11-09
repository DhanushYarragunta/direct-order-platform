# Deccan Kitchen & Co.

A multi-outlet restaurant ordering platform that connects customers, kitchen teams and administrators through direct ordering, central menu management and live kitchen operations.

## Features

### Customer ordering

- Browse 60 dishes across nine categories with dietary information, allergens, portions and add-ons.
- Choose delivery by GPS or supported locality with automatic outlet routing.
- Review preparation estimates, delivery charges, coupons and loyalty discounts before payment.
- Pay through Razorpay hosted checkout, with signed webhook verification and automatic reconciliation.
- Download itemized PDF payment receipts and track confirmed or pending refunds.
- Sign in with email or mobile number and a password. Codes are reserved for signup, password recovery and contact verification.
- Track orders through preparation, handoff and delivery completion.
- View order history, choose available favourites from mobile reorder cards and submit party-order requests. Reordering still requires reviewing options and explicitly adding to the cart.

### Kitchen operations

- Large tickets with labelled urgency indicators and preparation timers.
- Optional new-order sound, screen wake lock and home-screen installation.
- Live connection status, last-sync timestamps and reconnect handling.
- Outlet availability controls and audited manager promise overrides.

### Administration and reporting

- Manage dishes, photo uploads, city prices and serving schedules.
- Configure delivery policies, kitchen capacity and licence declarations.
- Review sales, preparation times and repeat purchases by outlet.
- Monitor payment recovery, pending refunds and notification delivery status.
- Inspect worker activity, failed or stalled tasks, queue ages and payment recovery references.
- Measure checkout duration, 30-day retention cohorts and direct-order adoption against aggregate app-order baselines.
- Explore preparation estimates, fallback reasons, manager overrides and late-message previews in the Admin/Manager AI workspace (`/workspace/ai`).

### Accounts and privacy

- Role-based access for customers, kitchen staff, managers and administrators.
- Accessible account navigation and sign-out on phones and tablets, with recoverable privacy-setting loads.
- Privacy notices, marketing preference controls and account-data export.
- Customer account anonymization and session revocation.

## Technology

| Area | Technology |
| --- | --- |
| Application | Next.js 16, React 19, TypeScript |
| Database | PostgreSQL 16, Prisma 7 |
| Live updates | Server-Sent Events with shared polling |
| Validation | Zod |
| Payments | Razorpay hosted checkout and signed webhooks |
| Email and SMS | Amazon SES, AWS End User Messaging; optional Resend and Twilio |
| PDF receipts | pdf-lib with embedded Noto fonts |
| Testing | Vitest, Playwright |
| Deployment | Docker, Docker Compose, Render Blueprint |
| CI | GitHub Actions |

## Getting started

### Requirements

- Node.js 22.12 or later and npm
- PostgreSQL 16

Run all commands from the project directory containing `package.json`.

```sh
git clone https://github.com/DhanushYarragunta/direct-order-platform.git
cd direct-order-platform
npm ci
npm run db:local
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

The local database helper creates a project database on port `55432` and an ignored `.env` file. Existing data and configuration are preserved. On macOS, it uses Homebrew's PostgreSQL 16 installation; set `POSTGRES_BIN` for a different binary location. For an existing database, configure `.env` from `.env.example` instead of running `db:local`. See [local setup and deployment](deployment.md) for details.

Use `npm run db:stop` to stop the project database.

### Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `APP_ORIGIN` | Canonical application origin used by request validation |
| `DEMO_MODE` | Enables demo accounts and simulated services |
| `DEMO_PASSWORD` | Password used when creating demo accounts |
| `UPLOAD_DIR` | Persistent storage for uploaded menu photos |
| `PRIVACY_CONTACT` | Business contact displayed in the privacy notice |

Additional settings are documented in [launch operations](docs/LAUNCH_OPERATIONS.md).

### Local demo access

In the local/demo environment with `DEMO_MODE=true`, visit `/login` and select **Customer**, **Admin**, **Manager** or an outlet's **Kitchen** account. Ordinary sign-in uses email/mobile plus password; signup verifies email by code. The hosted judges account is `judge@deccan.example`, with its password supplied privately. Shared local demo shortcuts remain disabled on that host.

Demo mode provides simulated services and sample accounts. Preparation estimates learn from 300 explicitly synthetic examples held in memory, with separate `demo-ridge-prep-v1` and `demo-rules-v1` versions. This also works with the existing explicitly enabled public Razorpay test checkout. No synthetic orders are inserted into the database or mixed into live training.

Admins and managers can open `/workspace/ai` to compare the current queue with busy, limited-history and unusual-load scenarios, preview an override that respects the kitchen minimum, or simulate ten minutes late. The customer/manager message log is preview-only: scenarios send and save nothing. Synthetic evaluation errors do not measure restaurant accuracy. Checkout and tracking identify learned demo estimates, live estimates, fallbacks and manager updates.

Live learning still requires at least 60 qualifying completed orders, chronological validation and improvement over the kitchen-load baseline. Live payments and messages require provider configuration and approved sender/merchant accounts. Seeded licence numbers and customer records are sample data.

See [live payments, OTP and messaging setup](docs/LIVE_SERVICES.md) for AWS configuration, Razorpay webhooks, cost controls and launch verification.

## Verification

Local verification on **8 November 2026** passed **196 unit tests, 115 database integration tests and 43 browser scenarios** (37 core, one hosted-checkout fixture and five registration/recovery scenarios), plus TypeScript and the production build.

Commit `27546c0a125688351033ef7ba1439dc950b1565e` is live on Render. Its [CI run 42469869009](https://github.com/DhanushYarragunta/direct-order-platform/actions/runs/42469869009) passed at **15:43:34 IST on 8 November 2026**, with the same test totals, TypeScript, production build, Docker image build, artifact upload and cleanup. All **seven hosted account-access checks passed again at 11:13:36 IST on 9 November**, covering database health, administrator password login, mobile account navigation, privacy settings, account-help availability, sign-out/session revocation and anonymous access rejection. See [release readiness](docs/RELEASE_READINESS.md) for current and historical evidence.

| Command | Purpose |
| --- | --- |
| `npm run check` | TypeScript, domain tests and production build |
| `npm run verify:core` | Full verification, including isolated database and browser tests |
| `npm run test:integration` | Database integration tests |
| `npm run test:e2e` | Browser scenarios against a production build |
| `npm run test:gateway-ui` | Hosted checkout browser flow with intercepted provider fixtures |
| `npm run test:registration-ui` | Non-demo signup, resend and password-login flow with intercepted email delivery |
| `npm run test:performance` | Local throughput and automated checkout smoke tests |
| `npm run test:soak` | Five-minute sustained local load test |

The earlier menu/authentication release on **8 November 2026** passed **162 unit tests, 107 database tests and 33 browser scenarios** (28 core, one hosted-checkout fixture and four non-demo signup/recovery scenarios), along with TypeScript and the production build. The isolated test databases apply all seven migrations. The checks include the 60-dish menu, nine category filters, email/mobile password login, 15-day sessions, OTP password reset with session revocation, webhook recovery and refund diagnostics. Payment, email and SMS calls in these automated suites were intercepted or mocked; these checks do not establish live provider activation. SMS recovery requires configured messaging; the current AWS SMS account has no approved sender setup.

AWS granted SES production access in Mumbai on **8 November**, and the signed-in console reconfirmed production access and a healthy account on **9 November**. Signup recipients no longer need individual SES verification. Receipt of signup/recovery emails after approval, sender-domain setup and inbox placement still need verification. Earlier provider checks confirmed a Razorpay test capture and receipt of an SES test email; the test refund remains pending after a provider HTTP 400 refusal. See [release readiness](docs/RELEASE_READINESS.md) for the remaining provider checks.

The earlier sustained local test on **5 November 2026** completed **100 simulated paid orders over five minutes with 45 live connections**, with no failed workflows or dropped arrivals. It predates the live-service changes and does not establish production capacity for the current integration.

Integration and browser verification use temporary databases on the project-local PostgreSQL instance. Browser and load tests require a production build and an available port `3001`; run them separately. Install Playwright Chromium with `npx playwright install chromium` if a supported browser is unavailable.

See [performance evidence](docs/PERFORMANCE.md) for methodology and [acceptance testing](docs/ACCEPTANCE_TESTING.md) for deployed-load, human-checkout and physical-tablet validation.

## Deployment

Docker Compose and the Render Blueprint configure the web application, background worker, PostgreSQL database and persistent photo storage.

- [Deploy on Render](docs/RENDER.md)
- [Local setup and deployment](deployment.md)
- [Configuration, monitoring and recovery](docs/LAUNCH_OPERATIONS.md)
- [Live payments, OTP and AWS messaging](docs/LIVE_SERVICES.md)

The readiness endpoint is `GET /api/health`. Deployment verification, operational recovery checks and verified business details must be completed before a live launch.

## Project structure

```text
src/app/          Pages and API routes
src/components/   Customer, kitchen and administration interfaces
src/lib/          Domain logic, authentication and data access
prisma/           Database schema, migrations and seed data
public/           Application images and icons
tests/            Domain, integration, browser and performance tests
scripts/          Development, verification and operational tools
docs/             Technical design and deployment documentation
.github/          CI workflows
```

## Documentation

- [Client brief](CLIENT_BRIEF.md)
- [Technical design](docs/TECHNICAL_DESIGN.md)
- [Review guide](docs/REVIEW_GUIDE.md)
- [Render deployment guide](docs/RENDER.md)

Dependencies, builds, credentials, local databases and generated reports are excluded from version control. Run `npm run package:source` to create an archive of committed source files.
