# Release readiness — 8 November 2026

## Verified application

The release passes 152 unit tests, 87 isolated database tests, 28 core browser scenarios, one hosted-checkout browser fixture and two non-demo registration browser scenarios. TypeScript, the production build and the Linux ARM64 Docker build pass. Provider fixtures do not send messages or move money. The six migrations are applied locally.

The latest fixes prevent immediate webhook retries in non-UTC database sessions, show failed/blocked webhook updates to administrators, preserve refund failure details until every affected payment is reconciled, and remount signup/code-login inputs when switching steps so password or OTP text cannot become a contact field.

GitHub Actions also passed for release commit `d4a0bdd55bc983f3e3d9f9e624eab9114814d75d`: [run 42403715322](https://github.com/DhanushYarragunta/direct-order-platform/actions/runs/42403715322), job `128496801624`, completed **8 November 2026 at 00:33:07 IST**. TypeScript/tests/build, isolated database and core browser checks, hosted-checkout fixtures, non-demo registration fixtures and the deployment-image build all succeeded.

## Initial Render inspection — before the update

Inspection found workspace **My Workspace**, project **My project**, environment **Production**, web service **direct-order-platform** (`srv-dbmb46gu01pc738tcodg`) and existing PostgreSQL 16 database **direct-order-db** (`dpg-dbmb6e2jnfac738v3g0g-a`) in Singapore. The database is currently ungrouped. No separate worker is provisioned.

The web service uses the repository's `main` branch and Dockerfile on the Free plan. At the initial inspection, the deployed commit was `2403bad`. Its environment contained `APP_ORIGIN`, `DATABASE_URL`, `NODE_ENV`, `PORT` and `PRIVACY_CONTACT`; values were kept masked. No payment/email settings or environment groups were present. Docker Command was unset, and the Free plan did not expose Pre-Deploy Command. These are historical findings; the approved configuration below has since been applied.

Before the update, runtime logs repeatedly reported database/Prisma failures from order maintenance. The readiness endpoint can succeed even when application tables are missing or incompatible. The completed migration record below supersedes the earlier schema uncertainty. Free hosting still spins down when inactive, so it cannot provide continuous background reconciliation.

## Completed Render update

Render deployment **`dep-dbnn8hng6t6s73cdb0dg`** succeeded on commit **`d4a0bdd`**. Startup applied all six migrations before starting the application: core, remaining scope, quality, live services, worker status and the gateway webhook inbox. The owner-approved test-mode environment settings and Docker Command below were applied to the existing service.

| Hosted check | Latest observed result |
| --- | --- |
| `/api/health` | HTTP 200 |
| `/login` | HTTP 200 |
| `/api/auth/methods` | HTTP 200 |
| Menu API for Kondapur, Kukatpally and Gachibowli | All three return HTTP 200, with seven available dishes and two add-ons |
| Seven catalogue `/food/*.jpg` URLs | All return HTTP 200 with JPEG content |
| Customer homepage/menu and cart | Visually verified seven dishes; adding the regular chicken biryani shows a ₹320 cart total |

Immediately after deployment, the menu API returned HTTP 404 because migrations created the schema without business records. The owner subsequently approved the reviewed catalogue, and that approved payload was imported into the existing Render database over a TLS connection with certificate verification (`verify-full`). The import inserted **33 records: three outlets, seven menu items, two add-ons and 21 outlet-availability rows**. It did not create customers, administrators, orders or licence-verification declarations.

The reported homepage/menu failure is now resolved: the approved catalogue renders and the cart displays the expected ₹320 price. These checks establish browsing and cart behaviour; they do not establish completed hosted signup, message delivery, payment recovery or end-to-end ordering acceptance. Initial administrator setup remains pending separate identity approval.

Render's database UI warns that the current **Free PostgreSQL database expires on 5 December 2026**. No plan upgrade or resource change was made. Arrange an approved continuity/export plan before that date; current Free hosting also cannot provide continuous background reconciliation while it sleeps.

## Applied owner-approved test configuration

The owner approved this test-mode setup on 8 November 2026. The update reused the existing service, database, region and Free plan. Existing data, origin, database URL and privacy contact were preserved. Shared demo accounts remain disabled.

| Setting/action | Applied value or purpose |
| --- | --- |
| Docker Command | `node scripts/start-render.mjs` so additive migrations complete before the new application starts; a dedicated script avoids Render's Docker command quote parsing |
| `DEMO_MODE` | `false` |
| `PAYMENT_PROVIDER` | `razorpay` |
| `ALLOW_PUBLIC_TEST_PAYMENTS` | `true`, with no real-money checkout |
| Razorpay keys and webhook secret | Existing local **test** configuration copied into the service's secret environment settings; values were not committed or printed |
| `SUPPORT_EMAIL` | Existing verified sender/contact supplied by the owner |
| `EMAIL_PROVIDER`, `AWS_REGION`, `EMAIL_FROM` | SES, `ap-south-1`, existing verified sender |
| AWS sending identity/credentials | Dedicated `deccan-render-ses-test` credential limited to `ses:SendEmail` from the verified identity in `ap-south-1`; entered in Render secret settings without using the owner's administrative login |
| `TRANSACTIONAL_EMAIL_ENABLED` | `true`; SES sandbox still limits recipients until approval |
| `TRANSACTIONAL_SMS_ENABLED` | `false` |
| `RUN_BACKGROUND_JOBS` | `true`, because this existing service has no separate worker; jobs stop while Free hosting sleeps |

The approved catalogue initialization is complete. Administrator identity/setup and any further business-data changes require separate approval. Do not run the demo seed or invent licence verification. Continue with hosted signup and order-flow acceptance using the initialized catalogue.

## Remaining provider checks

- The existing Razorpay test transaction captured ₹320. Provider reads confirm ₹0 refunded and no refund records. Both documented refund request paths returned HTTP 400; the exact provider-side cause is unconfirmed. Keep the full refund pending and review balance/payment eligibility in the merchant dashboard.
- The SES sender is verified, feedback forwarding is enabled, and the account suppresses bounces/complaints. A prior test email arrived in Spam. Production access is still disabled; a sender domain and inbox-placement checks remain necessary for a dependable launch.
- Configure the matching test webhook at `/api/payments/razorpay/webhook` and verify provider-triggered recovery against the updated host. The deployment has succeeded, but public provider delivery has not yet been confirmed; local signed webhook tests do not prove it.
- Live merchant activation, live keys, sender approval, persistent worker hosting and operational recovery checks are required before accepting real customer orders. SMS additionally requires the applicable sender/template registration.
