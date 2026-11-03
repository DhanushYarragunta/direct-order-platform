# Deployment and local setup

## Current state

The project is a local Next.js application. No public deployment or project GitHub URL has been created by the agent. The GitHub repository linked in the user’s request is a design reference, not this application’s repository.

## Local steps

1. Install Node 22.12 or later and PostgreSQL 16. Google Chrome is used for local browser verification on macOS.
2. In the project directory, run `npm install`. If npm requests setup-script approval, run `npm install-scripts ls`, approve the installed Prisma, Prisma engine, and esbuild packages, then run `npm rebuild`.
3. Run `npm run db:local`. This creates an isolated local cluster on loopback port 55432, a database, and an ignored `.env`. The helper uses the Homebrew ARM PostgreSQL path unless `POSTGRES_BIN` is supplied.
4. Run `npm run db:generate`, `npm run db:migrate`, and `npm run db:seed`.
5. Run `npm run dev` and visit `http://127.0.0.1:3000`. Do not interchange localhost and 127.0.0.1 without updating the application origin.
6. Run `npm run verify:core` before the first commit. It includes integration tests in a separate temporary database, browser checks, and saved desktop/mobile screenshots. It starts a temporary server on port 3001 and shuts it down after the run.

For an existing PostgreSQL instance, copy `.env.example` to `.env` and supply your own values instead of using `db:local`. The seed is non-destructive: existing items, users and orders are preserved. Repeated seeding does not change demo passwords or reset sample order times.

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
| Customer / `customer@deccan.example` | Ordering, payment, own history and tracking |
| Admin / `admin@deccan.example` | Central menu manager, all outlet operations |
| Manager / `manager@deccan.example` | Kondapur operations and promise overrides |
| Kondapur kitchen / `kondapur@deccan.example` | Kondapur kitchen tickets and availability |
| Gachibowli kitchen / `gachibowli@deccan.example` | Gachibowli kitchen tickets and availability |
| Kukatpally kitchen / `kukatpally@deccan.example` | Kukatpally kitchen tickets and availability |

Use separate browser profiles or an incognito window to review customer and staff flows simultaneously. A browser profile has one current account. The demo is intentionally accessible when enabled; do not use these shortcuts as production access control.

## Hosting plan, not a completed deployment

Use a long-running Node server with a managed PostgreSQL database. Install the locked dependencies with `npm ci`, generate Prisma, apply migrations as a release step, build with `npm run build`, and run `npm start`. Configure the database URL and exact HTTPS app origin through the host’s secret/environment settings. TLS must terminate at the proxy; session cookies become Secure when the configured origin uses HTTPS.

SSE endpoints must permit streamed responses, disable proxy buffering, and allow long-lived connections. The application starts a three-second job loop from Next instrumentation. A separately supervised `npm run worker` process is also available. Multiple loops are safe through database transactions and uniqueness, but a dedicated singleton worker reduces redundant polling. This design is not suitable for a short-lived request-only host without separate worker and stream infrastructure.

Back up PostgreSQL, provide health monitoring, and verify session expiry, database recovery, and streaming behaviour on the chosen host. No platform, paid service, credentials, or deployment has been provisioned yet.

Before a real launch, replace licence placeholders with verified FSSAI numbers, confirm photo rights and allergen declarations, implement real payments and delivery, set a retention/consent policy, remove demo data/shortcuts, and benchmark the expected peak. Those are production tasks beyond the first core checkpoint.
