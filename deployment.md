# Deployment and local setup

## Current state

Project repository: https://github.com/DhanushYarragunta/direct-order-platform

The application has a local review environment and an existing public Render deployment. The AI/mobile revision passed local TypeScript/build, 196 unit tests, 112 integration tests and 38 browser scenarios. Commit `82f5cfc02883f8163dcfba791a4e1f4a1293bc0e` is live on Render. All 19 hosted checks passed on that commit; CI also passed for the exact deployed commit. Deployment and CI details are recorded in `docs/RELEASE_READINESS.md`. Later local edits do not update that release. Follow `docs/RENDER.md` for upgrades and controlled staging; the root `render.yaml` retains safe public-demo settings. Check the actual GitHub Actions result and the deployed commit for each service instead of assuming local edits are published.

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

## Local/demo access for a reviewer

The accounts below are seeded for local/demo review with `DEMO_MODE=true`; open `/login` and choose a labelled role. They are not the hosted login credentials. The hosted judges account is `judge@deccan.example`, with the password supplied privately; shared demo shortcuts remain disabled there. Normal sign-in uses email/mobile plus password. OTP is limited to signup, password recovery and contact verification.

| Account | Access |
| --- | --- |
| Customer / `customer@deccan.example` | Ordering, coupons/loyalty, own history/tracking and party requests |
| Admin / `admin@deccan.example` | Central menu manager, city prices/schedules, all outlet operations/reports and party confirmations |
| Manager / `manager@deccan.example` | Kondapur reports, kitchen/promise overrides and party confirmations |
| Kondapur kitchen / `kondapur@deccan.example` | Kondapur kitchen tickets and availability |
| Gachibowli kitchen / `gachibowli@deccan.example` | Gachibowli kitchen tickets and availability |
| Kukatpally kitchen / `kukatpally@deccan.example` | Kukatpally kitchen tickets and availability |

Use separate browser profiles or an incognito window to review customer and staff flows simultaneously. A browser profile has one current account. The demo is intentionally accessible when enabled; do not use these shortcuts as production access control.

## AI demonstration configuration

The synthetic preparation model and `/workspace/ai` use existing configuration: either `DEMO_MODE=true`, or all of `ALLOW_PUBLIC_TEST_PAYMENTS=true`, `PAYMENT_PROVIDER=razorpay` and a Razorpay test key. No external model service, new credential, migration or training seed is required. Existing public-test authentication remains unchanged; the AI page requires ADMIN or MANAGER, with outlet scope enforced.

The 300 synthetic training examples stay in memory. Scenario evaluation reads the current queue and returns preview-only estimates and messages; it creates no orders, sends/saves no messages and changes no cloud or provider settings. Real estimates retain the separate live-history gate. Actual late notifications depend on a running host/worker and configured delivery providers; free hosting can pause background work while asleep.

The production build and local suites have passed; exact totals are recorded in `docs/RELEASE_READINESS.md`. To reproduce them, run the existing isolated integration/browser suites with port 3001 free. The current deployment corrects browser-test synchronization; all 33 core scenarios passed again locally. Its 19 hosted checks passed; CI also passed for the exact deployed commit.

## Hosting and release verification

Use a long-running Node server with a managed PostgreSQL database. Install the locked dependencies with `npm ci`, generate Prisma, apply migrations as a release step, build with `npm run build`, and run `npm start`. Configure the database URL and exact HTTPS app origin through the host’s secret/environment settings. TLS must terminate at the proxy; session cookies become Secure when the configured origin uses HTTPS.

SSE endpoints must permit streamed responses, disable proxy buffering, and allow long-lived connections. The application starts a three-second job loop from Next instrumentation. A separately supervised `npm run worker` process is also available. Multiple loops are safe through database transactions and uniqueness, but a dedicated singleton worker reduces redundant polling. This design is not suitable for a short-lived request-only host without separate worker and stream infrastructure.

Back up PostgreSQL, provide health monitoring, and verify session expiry, database recovery, and streaming behaviour on the chosen host. Existing hosting and a successful local build do not establish that the newest release or provider configuration has been deployed.

For deployment commands, Docker/Compose, explicit public-demo opt-in, uploads persistence, CI, health monitoring and a backup/restore drill, follow `docs/LAUNCH_OPERATIONS.md`. Before a real business launch, record verified FSSAI numbers and verification notes in Admin outlet settings, confirm photo rights/allergens, provide the privacy contact and approved retention policy, and complete target-device and staging acceptance. Razorpay and email/SMS provider code is available; ordinary customer use requires the documented activation and acceptance checks.

## Review the extended features

- Customer: order two regular biryanis, apply BIRYANI10, select loyalty points and pay. Cancel while the order is PLACED to verify points return. WELCOME100 requires a new registered customer; the existing demo customer has paid history.
- AI workspace: as Admin or Manager, open `/workspace/ai`; compare full/limited synthetic history, unusual-load fallback, minimum-respecting overrides and ten-minute late-message previews. Nothing is sent or saved. On mobile, choose a reorder suggestion and verify the cart changes only after explicit Add.
- Customer party orders: send a request at least 24 hours ahead. Sign in as Manager for Kondapur (or Admin for any outlet), open Party requests and confirm with details. The customer sees the response.
- Menu manager: edit a dish, add a Hyderabad city override, or set serving days and hours in IST. The kitchen stock switch remains independent of the serving schedule.
- Overview: compare kitchen rows and change the reporting period. Repeat customers means two paid orders within that period. The Business targets section separately reports 30-day cohorts and checkout timing, and lets managers enter aggregate app-order baselines for matching periods.

Generated outputs are ignored, not tracked. `npm run package:source` creates a small ZIP from committed source only. The optional technical design PDF and this file can be packaged in `output/submission.zip` (two files, under 25 MB). PDF source is `docs/TECHNICAL_DESIGN.md`; run `python scripts/build-tdd.py` with ReportLab and Pillow after browser verification to regenerate both the PDF and ZIP together. The builder validates the ZIP contents and size; visually inspect the resulting PDF before submission.

## Quality verification

The repository includes `/api/health`, strict nonce CSP/HSTS, email/mobile password sign-in, signup/recovery/contact-verification codes, privacy controls, 60 dishes across nine categories, secure photo uploads, delivery completion, fees/localities, prepayment wait estimates, large tablet tickets, connection states and business-target metrics. See the README for the latest recorded local verification and `docs/ACCEPTANCE_TESTING.md` for physical readability, human timing and sustained staging validation. Recheck the deployed release independently.


## Live services

The code supports Razorpay hosted checkout, PDF payment receipts, password sign-in, signup/recovery/contact-verification codes and transactional notifications. Amazon SES and AWS End User Messaging are the default messaging adapters; Resend/Twilio are optional. Follow [the live service guide](docs/LIVE_SERVICES.md) and set the named variables from `.env.example` in both the web and worker environments. Compose propagates these settings to both processes; an AWS-hosted workload should use an IAM role instead of copied credentials.

The existing Render blueprint deliberately remains a demo deployment. AWS credits do not pay Render fees or Razorpay transaction fees. Using AWS for email/SMS does not itself deploy the web application to AWS.

After upgrading, run `npm run db:migrate` and `npm run build`, then restart the web and worker processes together. Review **Workspace → Services** for configuration and queue status. Do not enable live keys while shared demo accounts are enabled. Test provider calls using the documented sandbox/controlled acceptance procedure before live customer use.
