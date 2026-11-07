# Release readiness — 8 November 2026

## Verified application

The release passes 152 unit tests, 87 isolated database tests, 28 core browser scenarios, one hosted-checkout browser fixture and two non-demo registration browser scenarios. TypeScript, the production build and the Linux ARM64 Docker build pass. Provider fixtures do not send messages or move money. The six migrations are applied locally.

The latest fixes prevent immediate webhook retries in non-UTC database sessions, show failed/blocked webhook updates to administrators, preserve refund failure details until every affected payment is reconciled, and remount signup/code-login inputs when switching steps so password or OTP text cannot become a contact field.

## Existing Render deployment

Inspection found workspace **My Workspace**, project **My project**, environment **Production**, web service **direct-order-platform** (`srv-dbmb46gu01pc738tcodg`) and existing PostgreSQL 16 database **direct-order-db** (`dpg-dbmb6e2jnfac738v3g0g-a`) in Singapore. The database is currently ungrouped. No separate worker is provisioned.

The web service uses the repository's `main` branch and Dockerfile on the Free plan. At inspection, the deployed commit was `2403bad`. Its environment contains `APP_ORIGIN`, `DATABASE_URL`, `NODE_ENV`, `PORT` and `PRIVACY_CONTACT`; values were kept masked. No payment/email settings or environment groups were present. Docker Command is unset and the Free plan does not expose Pre-Deploy Command.

Runtime logs repeatedly report database/Prisma failures from order maintenance. The readiness endpoint can succeed even when application tables are missing or incompatible; inspect migration output before attributing the exact cause. Current hosting spins down when inactive, so it cannot provide continuous background reconciliation.

## Owner-approved deployment changes

The owner approved this test-mode setup on 8 November 2026. Deployment and provider verification outcomes must be recorded separately from that approval.

No service, database, region or plan will be deleted, recreated or changed. Existing data, origin, database URL and privacy contact are preserved. Do not enable shared demo accounts on this database.

| Setting/action | Proposed value or purpose |
| --- | --- |
| Docker Command | `sh -c 'node node_modules/prisma/build/index.js migrate deploy && node scripts/start-production.mjs'` so additive migrations complete before the new application starts |
| `DEMO_MODE` | `false` |
| `PAYMENT_PROVIDER` | `razorpay` |
| `ALLOW_PUBLIC_TEST_PAYMENTS` | `true`, with no real-money checkout |
| Razorpay keys and webhook secret | Copy the existing local **test** configuration into this service's secret environment settings; never commit or print the values |
| `SUPPORT_EMAIL` | Existing verified sender/contact supplied by the owner |
| `EMAIL_PROVIDER`, `AWS_REGION`, `EMAIL_FROM` | SES, `ap-south-1`, existing verified sender |
| AWS sending identity/credentials | Dedicated credential limited to SES sending from the verified identity, stored only in Render secret settings; never reuse the owner's administrative login |
| `TRANSACTIONAL_EMAIL_ENABLED` | `true`; SES sandbox still limits recipients until approval |
| `TRANSACTIONAL_SMS_ENABLED` | `false` |
| `RUN_BACKGROUND_JOBS` | `true`, because this existing service has no separate worker; jobs stop while Free hosting sleeps |

Do not seed sample customers or fictional licence declarations into the existing database. After migrations, inspect the actual menu/account data and obtain approval for any required initial business data.

## Remaining provider checks

- The existing Razorpay test transaction captured ₹320. Provider reads confirm ₹0 refunded and no refund records. Both documented refund request paths returned HTTP 400; the exact provider-side cause is unconfirmed. Keep the full refund pending and review balance/payment eligibility in the merchant dashboard.
- The SES sender is verified, feedback forwarding is enabled, and the account suppresses bounces/complaints. A prior test email arrived in Spam. Production access is still disabled; a sender domain and inbox-placement checks remain necessary for a dependable launch.
- Configure the matching test webhook at `/api/payments/razorpay/webhook` after the hosted update, then verify provider-triggered recovery. Local signed webhook tests do not prove public provider delivery.
- Live merchant activation, live keys, sender approval, persistent worker hosting and operational recovery checks are required before accepting real customer orders. SMS additionally requires the applicable sender/template registration.
