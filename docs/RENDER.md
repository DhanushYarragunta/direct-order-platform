# Deploy the review app on Render

The root `render.yaml` creates a Docker web service, a Docker background worker, and managed PostgreSQL 16 in Singapore. Uploaded menu photos use a persistent disk. This configuration is for a public **demo**, with shared demo accounts, simulated payments/messages and on-screen phone codes. Use sample customer details.

## Cost to review before creating resources

Checked against Render's official pricing and compute-plan documentation on 5 November 2026:

| Resource | Current plan / allocation | Monthly price (USD) |
| --- | --- | ---: |
| Web service | `0.5c-512mb` — 512 MB RAM | $7.00 |
| Background worker | `0.5c-512mb` — 512 MB RAM | $7.00 |
| Managed PostgreSQL | `0.1c-256mb` — 256 MB RAM | $6.00 |
| PostgreSQL storage | 1 GB included, explicitly selected | $0.00 |
| Upload disk | 1 GB at $0.25/GB/month | $0.25 |
| **Base resource total** | **Hobby workspace: $0 plus compute** | **$20.25/month** |

This is a base estimate, not a spending cap. Taxes, bandwidth/pipeline overages, a paid workspace, or later resource upgrades cost extra. Confirm the displayed prices in Render before accepting. The current plan IDs replace older names such as `starter`; these are the smallest paid plans, suitable for initial review rather than a proven production capacity target. Sources: [Render pricing](https://render.com/pricing), [current compute plans](https://render.com/docs/compute-plans).

## Deploy it yourself

1. Push the reviewed commits, including `render.yaml`, to the repository's `main` branch. The Blueprint uses [DhanushYarragunta/direct-order-platform](https://github.com/DhanushYarragunta/direct-order-platform).
2. Sign in to [Render](https://dashboard.render.com), connect your GitHub account, and choose **New → Blueprint**. Select the repository, `main` branch and root `render.yaml`.
3. Review the three resources, their Singapore region, plans and storage charges. Keep the database disk at **1 GB**; allowing a larger default changes the price. Create the Blueprint when you are ready to incur the displayed charges.
4. Wait for both services to build and deploy. Each service runs `prisma migrate deploy` before startup; Prisma coordinates concurrent migration attempts with its database lock. If Render reports a migration-lock timeout during first creation, retry that service's deploy after the other finishes.
5. Open the **web service → Shell** and run the first-time demo seed explicitly:

   ```sh
   node --import tsx prisma/seed.ts
   ```

   Render generates `DEMO_PASSWORD` and supplies it directly to the web service. The seed uses those environment variables; no `.env` file or credential copy is needed. Do not print the generated password. Seeding is not configured to run on every deploy. Use the labelled demo sign-in buttons after initialization.
6. Open the web service's assigned HTTPS `onrender.com` URL. Its `/api/health` must return HTTP 200 with `status: "ok"`. An empty menu or unavailable demo account usually means step 5 has not completed.
7. Verify a customer order and its kitchen ticket, delayed test payment/expiry processing, delivery completion, and a photo upload. Redeploy the web service and confirm the uploaded photo still works. In the worker's Shell, `node scripts/healthcheck.mjs --worker` should exit successfully; also inspect worker logs for repeated database failures.

Automatic deploys are disabled in this review Blueprint. After a later push, manually deploy the latest commit for **both** web and worker. If you change the Blueprint configuration, sync that change in Render as well. The files do not provision anything until you create/sync the Blueprint. See [Render's Blueprint setup](https://render.com/docs/infrastructure-as-code) and [deploy lifecycle](https://render.com/docs/deploys).

## Upgrade the existing deployment

Use the existing services for an upgrade; creating another Blueprint would create another set of chargeable resources. First verify the release commit in GitHub Actions, including the hosted-checkout fixture. Deploy that same commit to web and worker and allow the pre-deploy migration step to finish. This release includes live-service tables, worker-status reports and a durable Razorpay webhook inbox; running the old worker alongside the new web release leaves new payment events unprocessed.

Check `/api/health` and `/api/auth/methods` on the deployed origin. Both should return HTTP 200; the latter should report the configured sign-in methods without credentials. Sign in and open **Workspace → Services** to confirm fresh worker reports. Complete customer signup, a payment, the kitchen stages and receipt download against the deployed release. Exercise a signed provider webhook and processed refund when using configured Razorpay test keys. A successful health response alone does not verify these flows.

## Controlled staging with Razorpay test payments and SES

The checked-in Blueprint keeps payments simulated and outbound order messages disabled by default for the public demo. Its explicit settings are reapplied when the Blueprint is synced. Keep a separate database for real-contact staging; do not convert the seeded shared demo database into a customer identity store. Configure staging runtime values in both existing target services only after selecting that database. No staging resources are created by these instructions.

| Setting | Staging value or source |
| --- | --- |
| `DATABASE_URL` | Isolated staging database with migrations applied and no demo identities |
| `APP_ORIGIN` | Exact canonical HTTPS web origin, identical in web and worker |
| `DEMO_MODE`, `ALLOW_PUBLIC_DEMO` | `false` |
| `ALLOW_PUBLIC_TEST_PAYMENTS` | `true` |
| `PAYMENT_PROVIDER` | `razorpay` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Matching test-mode credentials in protected runtime settings |
| `RAZORPAY_WEBHOOK_SECRET` | Secret for the test-mode webhook at `/api/payments/razorpay/webhook` |
| `PRIVACY_CONTACT`, `SUPPORT_EMAIL` | Real operator contacts |
| `EMAIL_PROVIDER`, `AWS_REGION`, `EMAIL_FROM` | `ses`, the verified identity's region, and approved sender |
| AWS credentials | Scoped runtime credentials through the AWS default credential chain; rotate expiring sessions |
| `TRANSACTIONAL_EMAIL_ENABLED` | `true` for the controlled order-email test |
| `TRANSACTIONAL_SMS_ENABLED` | `false` until the SMS sender and templates are approved |
| `RUN_BACKGROUND_JOBS` | `false` in web; run the separate worker continuously |

Render does not automatically inherit local AWS CLI credentials. Configure the runtime credential chain explicitly without adding secrets to `render.yaml`, Docker build arguments or Git. Keep web and worker provider settings synchronized. The Blueprint's demo values must be removed or changed in a reviewed staging configuration before a future sync; dashboard edits alone are not durable Blueprint configuration.

SES sandbox recipients must be verified in the same region. An individually verified email address permits limited testing; use a domain you control with SES DKIM records and request regional production access before ordinary customer email. Test delivery and inbox placement after DNS verification. A Razorpay test capture does not confirm live merchant activation or processed refunds. Complete the controlled acceptance checklist in [LIVE_SERVICES.md](LIVE_SERVICES.md#verification-before-live-activation). Live launch additionally requires disabling `ALLOW_PUBLIC_TEST_PAYMENTS`, activating the merchant account and using corresponding live keys/webhook settings.

## Origin, secrets and storage

`APP_ORIGIN` self-references the web service's `RENDER_EXTERNAL_URL`. This supported Render feature resolves the actual assigned HTTPS URL; the application does not guess a hostname or trust request headers. For a custom domain, set `APP_ORIGIN` to that exact HTTPS origin and update the Blueprint reference so a later sync does not undo it. Use one canonical origin for login and checkout. Sources: [self-referencing environment variables](https://render.com/docs/blueprint-spec#self-referencing-environment-variables), [Render's default variables](https://render.com/docs/environment-variables).

Both services receive a private-network database connection string from Render. `ipAllowList: []` disables public database access. The web service has `/app/uploads` mounted persistently and `UPLOAD_DIR` points there. The worker does not serve photos and needs no disk. No secret is committed or used as a Docker build argument by the application.

A Render persistent disk is attached to one service instance. It prevents horizontal scaling and causes a brief web-service interruption during deploys. Move uploads to shared object storage before adding replicas. Disk snapshots and managed database backups are separate; validate restore procedures and reapply privacy deletions before reopening restored data. Sources: [persistent disk limitations](https://render.com/docs/disks#disk-limitations-and-considerations), [managed PostgreSQL](https://render.com/docs/postgresql-creating-connecting). See `docs/LAUNCH_OPERATIONS.md` for the broader recovery checklist.

## What remains after deployment

A green deployment confirms hosting, not business launch readiness. Verify the real deployed topology, alerts and backup restoration; run sustained traffic against it before making capacity claims. Human checkout timing and tablet readability need direct observation. Public demo switches must be disabled before accepting real customer data, and the operator must supply verified licences, a privacy contact and an approved retention schedule. Payment and email/SMS integrations are implemented; live use still requires provider approvals and completed acceptance checks.

The configuration uses fields verified in the [official Blueprint specification](https://render.com/docs/blueprint-spec). Local schema validation can check structure; only Render's actual deployment and the checks above confirm the host configuration works.
