# Deccan Kitchen & Co. - Deployment Guide

GitHub: https://github.com/DhanushYarragunta/direct-order-platform
Live application: https://direct-order-platform.onrender.com
Author: Dhanush Yarragunta
Date: 9 November 2026
Reviewed release: `baca6cfcb68e065e57397d5dc129e747384b5826`

## 1. Reviewer login

Open the live application and sign in with the assessment account:

- Email: `judge@deccan.example`
- Password: `Supplied only in the private reviewer ZIP`
- Role: Administrator

The password is supplied separately in the private submission ZIP. Provider credentials and infrastructure secrets are stored separately in the hosting environment.

The administrator workspace provides access to the menu, coupons, catering requests, kitchen screens, reports and preparation-time demonstrations.

| Screen | Path |
| --- | --- |
| Dashboard and reporting | /workspace |
| Central menu management | /workspace/menu |
| Kitchen display | /kitchen |
| Preparation-time AI | /workspace/ai |
| Coupon management | /workspace/coupons |
| Party bookings | /workspace/catering |

For the full customer-to-kitchen walkthrough, use the separate local demo roles described below. The hosted payment flow uses Razorpay test checkout. Separate hosted customer and kitchen reviewer accounts have not yet been verified; this guide does not claim a completed live two-role walkthrough.

### Live reviewer notes

The first request may take about a minute if Render has put the service to sleep. Wait for the login page before retrying. Use separate browser profiles for separate accounts; two private windows may share the same private session.

For Razorpay test-mode card checkout use Visa `4100 2800 0000 1007`, any future expiry and a random CVV. Select Success on the mock bank page, or enter an arbitrary 4-10 digit OTP if the test page requests one. Use only test mode; do not enter a real card. Razorpay's legacy UPI test flow documents `success@razorpay` and `failure@razorpay`; availability depends on the checkout integration, so use the card route if UPI is not offered. Official card reference: https://github.com/razorpay/markdown-docs/blob/master/payments/payments/test-card-details.md

The administrator is a dedicated demonstration account. Keep the reviewer ZIP private. After review, rotate its password and revoke its sessions; apply the same process to any additional reviewer accounts. Provider keys are not included.

## 2. Local setup with Docker Compose (recommended)

Start Docker Desktop or a Docker Engine with Compose. In a fresh checkout:

```sh
git clone https://github.com/DhanushYarragunta/direct-order-platform.git
cd direct-order-platform
git checkout baca6cfcb68e065e57397d5dc129e747384b5826
```

Create an ignored `.env` file with the following values. Replace both password placeholders with different random URL-safe strings (letters and numbers, at least 24 characters). Do not overwrite an existing deployment's `.env`.

```dotenv
POSTGRES_PASSWORD=REPLACE_WITH_RANDOM_DATABASE_PASSWORD
DEMO_PASSWORD=REPLACE_WITH_RANDOM_DEMO_PASSWORD
APP_ORIGIN=http://127.0.0.1:3000
DEMO_MODE=true
ALLOW_PUBLIC_DEMO=false
PAYMENT_PROVIDER=demo
EMAIL_PROVIDER=disabled
SMS_PROVIDER=disabled
TRANSACTIONAL_EMAIL_ENABLED=false
TRANSACTIONAL_SMS_ENABLED=false
```

```sh
docker compose up --build -d
docker compose exec web node --import tsx prisma/seed.ts
```

Open http://127.0.0.1:3000. Compose starts PostgreSQL, migrations, the app and the worker; the second command adds the sample catalogue and demo accounts. Use `docker compose logs web` to inspect startup and `docker compose down` to stop while retaining database data. The CI Docker build passed. Compose startup was not rerun during the submission check because the local Docker daemon was stopped.

### Alternative: Node and PostgreSQL

Install Node.js 22.12 or later, npm and PostgreSQL 16.

```sh
git clone https://github.com/DhanushYarragunta/direct-order-platform.git
cd direct-order-platform
git checkout baca6cfcb68e065e57397d5dc129e747384b5826
npm ci
npm run db:local
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://127.0.0.1:3000.

The database helper creates a local project database on port 55432 and an ignored `.env` file. On macOS it uses the Homebrew PostgreSQL installation. Set POSTGRES_BIN if the PostgreSQL binaries are in another directory.

For an existing PostgreSQL instance or another operating system, copy `.env.example` to `.env`, configure your database connection, application origin and demo settings, and continue from `npm run db:generate`. The seed creates sample dishes, outlets, orders, rewards and catering requests.

The checkout command selects the same revision as the reviewed live application. Use `git checkout main` to return to the latest main branch.

## 3. Demo roles and walkthrough

In local demo mode, the login screen has Customer, Admin and Manager buttons and a Kitchen staff outlet selector. These shortcuts provide access without an email or SMS code. DEMO_PASSWORD controls the password used when the seed creates the local sample accounts.

Use two browser profiles or a normal and private window:

1. Select Customer in the first window. Choose Kondapur, add a dish, review portions and extras, and proceed to checkout.
2. Enter sample recipient details, choose pickup and complete a successful simulated payment.
3. Select Kitchen staff - Kondapur in the second window. Find the new ticket and move it through Preparing, Ready and Handoff.
4. Return to the customer window to see the updated order status.
5. Use Admin to edit a menu item, change availability or manage a coupon.
6. Open the AI workspace and compare normal, busy and limited-history scenarios. Review the preparation estimate, fallback and manager override.

Stop the app with Ctrl+C. Run `npm run db:stop` to stop the local project database.

## 4. Verification commands

```sh
npm run check
npm run verify:core
npm run test:gateway-ui
npm run test:registration-ui
```

Install the browser runtime if needed with `npx playwright install chromium`. Browser checks use port 3001 and isolated test databases. Run the suites one at a time.

The submitted release passed 236 unit tests, 133 database integration tests, TypeScript, the production build and CI browser/Docker checks. A further 23 checks passed against the hosted application. Release evidence is recorded in `docs/RELEASE_READINESS.md`.

## 5. Deployment

Render builds the Dockerfile from the repository's main branch. The service starts with `node scripts/start-render.mjs`, which applies Prisma migrations and then starts the application. PostgreSQL 16 stores the shared application data. Background jobs handle payment reconciliation, expiry and order updates.

Health check: `/api/health`.

For a production build locally:

```sh
npm run build
npm start
```

A separate worker can be started with `npm run worker`. The repository also includes Docker Compose, a Render Blueprint and deployment documentation under `docs/`.

## 6. Environment variables

Names are listed below. Configure their values in the local `.env` file or hosting environment.

| Purpose | Variables |
| --- | --- |
| Application and database | DATABASE_URL, APP_ORIGIN, NODE_ENV, PORT |
| Demo accounts and local database | DEMO_MODE, DEMO_PASSWORD, ALLOW_PUBLIC_DEMO, POSTGRES_BIN |
| File storage and contact details | UPLOAD_DIR, PRIVACY_CONTACT, SUPPORT_EMAIL |
| Background jobs | RUN_BACKGROUND_JOBS |
| Payments | PAYMENT_PROVIDER, ALLOW_PUBLIC_TEST_PAYMENTS, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET |
| Email | EMAIL_PROVIDER, EMAIL_FROM, TRANSACTIONAL_EMAIL_ENABLED, RESEND_API_KEY |
| AWS access | AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN |
| SMS | SMS_PROVIDER, TRANSACTIONAL_SMS_ENABLED, AWS_SMS_ROUTE, AWS_SMS_MAX_PRICE_USD, AWS_SMS_OTP_TEMPLATE, AWS_SMS_UPDATE_TEMPLATE |
| Registered SMS sender | AWS_SMS_ORIGINATION_IDENTITY, AWS_SMS_ENTITY_ID, AWS_SMS_OTP_TEMPLATE_ID, AWS_SMS_UPDATE_TEMPLATE_ID |
| Optional Twilio adapter | TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID, TWILIO_MESSAGING_SERVICE_SID |

The full configuration reference is in `.env.example` and `docs/LIVE_SERVICES.md`. Local demo review uses simulated payment and messaging adapters.
