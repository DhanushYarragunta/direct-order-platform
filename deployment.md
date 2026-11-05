# Deployment and local setup

## Current state

Project repository: https://github.com/DhanushYarragunta/direct-order-platform

The application is ready for local review. No public app deployment has been provisioned. The selected deployment provider is Render; follow `docs/RENDER.md` and the root `render.yaml`. Public repository access and the previous feature commit (`8ec7601`) were checked on 4 November 2026. The quality changes are committed locally after verification; push separately after reviewing the new history.

## Local steps

1. Install Node 22.12 or later and PostgreSQL 16. Google Chrome is used for local browser verification on macOS.
2. In the project directory, run `npm install`. If npm requests setup-script approval, run `npm install-scripts ls`, approve the installed Prisma, Prisma engine, and esbuild packages, then run `npm rebuild`.
3. Run `npm run db:local`. This creates an isolated local cluster on loopback port 55432, a database, and an ignored `.env`. The helper uses the Homebrew ARM PostgreSQL path unless `POSTGRES_BIN` is supplied.
4. Run `npm run db:generate`, `npm run db:migrate`, and `npm run db:seed`.
5. Run `npm run dev` and visit `http://127.0.0.1:3000`. Do not interchange localhost and 127.0.0.1 without updating the application origin.
6. Run `npm run verify:core` before committing the review candidate. It includes integration tests in a separate temporary database, browser checks, and saved desktop/mobile screenshots. It starts a temporary server on port 3001 and shuts it down after the run.
7. Optionally run `npm run test:performance` after the production build. It creates its own temporary database and server on port 3001, offers 30 orders over 90 seconds with three live kitchen screens, and times five automated mobile checkout flows. See `docs/PERFORMANCE.md` for scope and evidence. Do not run it simultaneously with browser verification because both use port 3001.

For an existing PostgreSQL instance, copy `.env.example` to `.env` and supply your own values instead of using `db:local`. The seed preserves existing records, except it upgrades the exact old FSSAI text placeholder and untouched inactive haleem demo row. Repeated seeding does not change demo passwords or reset sample order times.

## Environment variable names

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection used by Prisma and its PostgreSQL adapter |
| `APP_ORIGIN` | Exact permitted web origin, including protocol and port |
| `DEMO_MODE` | Enables explicit demo-account shortcuts and the simulated payment gateway |
| `DEMO_PASSWORD` | Password used when the seed creates demo users; kept outside Git |
| `POSTGRES_BIN` | Optional PostgreSQL binary-directory override for the local helper |
| `PORT` | Optional production Next.js listening port |

The test runner sets its own temporary database and app origin. `CORE_TEST_DATABASE` and `CORE_INTEGRATION` are internal test safeguards, not deployment variables.

## Demo access for a reviewer

Open `/login` and choose one of the labelled demo accounts. No shared password needs to be placed in this document.

| Account | Access |
| --- | --- |
| Customer / `customer@deccan.example` | Ordering, coupons/loyalty, own history/tracking and party requests |
| Admin / `admin@deccan.example` | Central menu manager, city prices/schedules, all outlet operations/reports and party confirmations |
| Manager / `manager@deccan.example` | Kondapur reports, kitchen/promise overrides and party confirmations |
| Kondapur kitchen / `kondapur@deccan.example` | Kondapur kitchen tickets and availability |
| Gachibowli kitchen / `gachibowli@deccan.example` | Gachibowli kitchen tickets and availability |
| Kukatpally kitchen / `kukatpally@deccan.example` | Kukatpally kitchen tickets and availability |

Use separate browser profiles or an incognito window to review customer and staff flows simultaneously. A browser profile has one current account. The demo is intentionally accessible when enabled; do not use these shortcuts as production access control.

## Hosting plan, not a completed deployment

Use a long-running Node server with a managed PostgreSQL database. Install the locked dependencies with `npm ci`, generate Prisma, apply migrations as a release step, build with `npm run build`, and run `npm start`. Configure the database URL and exact HTTPS app origin through the host’s secret/environment settings. TLS must terminate at the proxy; session cookies become Secure when the configured origin uses HTTPS.

SSE endpoints must permit streamed responses, disable proxy buffering, and allow long-lived connections. The application starts a three-second job loop from Next instrumentation. A separately supervised `npm run worker` process is also available. Multiple loops are safe through database transactions and uniqueness, but a dedicated singleton worker reduces redundant polling. This design is not suitable for a short-lived request-only host without separate worker and stream infrastructure.

Back up PostgreSQL, provide health monitoring, and verify session expiry, database recovery, and streaming behaviour on the chosen host. No platform, paid service, credentials, or deployment has been provisioned yet.

For deployment commands, Docker/Compose, explicit public-demo opt-in, uploads persistence, CI, health monitoring and a backup/restore drill, follow `docs/LAUNCH_OPERATIONS.md`. Before a real business launch, record verified FSSAI numbers and verification notes in Admin outlet settings, confirm photo rights/allergens, provide the privacy contact and approved retention policy, and complete target-device and staging acceptance. Mock payments/messages remain within the assessment scope; actual providers require a separate production decision.

## Review the extended features

- Customer: order two regular biryanis, apply BIRYANI10, select loyalty points and pay. Cancel while the order is PLACED to verify points return. WELCOME100 requires a new registered customer; the existing demo customer has paid history.
- Customer party orders: send a request at least 24 hours ahead. Sign in as Manager for Kondapur (or Admin for any outlet), open Party requests and confirm with details. The customer sees the response.
- Menu manager: edit a dish, add a Hyderabad city override, or set serving days and hours in IST. The kitchen stock switch remains independent of the serving schedule.
- Overview: compare kitchen rows and change the reporting period. Repeat customers means two paid orders within that period. The Business targets section separately reports 30-day cohorts and checkout timing, and lets managers enter aggregate app-order baselines for matching periods.

Generated outputs are ignored, not tracked. `npm run package:source` creates a small ZIP from committed source only. The optional technical design PDF and this file can be packaged in `output/submission.zip` (two files, under 25 MB). PDF source is `docs/TECHNICAL_DESIGN.md`; run `python scripts/build-tdd.py` with ReportLab and Pillow after browser verification to regenerate both the PDF and ZIP together. The builder validates the ZIP contents and size; visually inspect the resulting PDF before submission.

## Quality verification (5 November 2026)

The repository now includes `/api/health`, strict nonce CSP/HSTS, demo phone OTP, privacy controls, seven dishes, secure photo uploads, delivery completion, fees/localities, prepayment wait estimates, large tablet tickets, connection states and business-target metrics. See `docs/ACCEPTANCE_TESTING.md` for physical readability, human timing and sustained staging validation. No public deployment is claimed until a host is selected and checked.
