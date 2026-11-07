# Deployment, privacy and recovery

This repository includes a production Node container, PostgreSQL Compose service, separate order worker, database readiness endpoint, strict script CSP, and a GitHub Actions verification workflow. These are deployable files, not evidence of a completed public deployment. Docker Compose configuration and a Linux ARM64 Docker image build passed locally on 5 November 2026. The deployed services and full container/database runtime still need smoke checks on the chosen host. The workflow also builds the image when pushed to GitHub.

## Container review environment

Use Docker Engine with Compose v2. Set configuration through an ignored environment file or your host's secret store. `POSTGRES_PASSWORD` is interpolated into a connection URL; use a long random hexadecimal password (for example, `openssl rand -hex 32`). Do not reuse the local development database credentials.

```dotenv
POSTGRES_PASSWORD=<your URL-safe random password>
APP_ORIGIN=http://127.0.0.1:3000
DEMO_MODE=true
DEMO_PASSWORD=<a different strong demo password>
ALLOW_PUBLIC_DEMO=false
```

```sh
docker compose up --build -d
docker compose exec web node --import tsx prisma/seed.ts
docker compose ps
curl --fail http://127.0.0.1:3000/api/health
```

The migration service must finish successfully before the web and worker start. Seeding is explicit and is for the review environment. Do not seed demo users or fictional licence numbers into a live restaurant's database. Persistent named volumes hold PostgreSQL and uploaded photos. `docker compose down` keeps those volumes; `down --volumes` destroys them and is not a recovery procedure.

The container runs as the unprivileged `node` user. The web port binds only to host loopback. Configure a TLS reverse proxy for external access, with request body and connection limits and SSE buffering disabled. A public demo requires HTTPS, `DEMO_MODE=true` and the explicit `ALLOW_PUBLIC_DEMO=true` acknowledgement. Shared demo accounts and on-screen OTPs are intentionally insecure for real customer identity; the demo must only contain sample data. A live deployment uses `DEMO_MODE=false` and a real `PRIVACY_CONTACT`.

The application now includes Razorpay payments/refunds, PDF receipts, Amazon SES email and AWS End User Messaging SMS, with Resend/Twilio alternatives. Demo mode remains available. Live operation requires provider credentials, merchant/sender approvals and controlled acceptance checks; see [live service setup](LIVE_SERVICES.md). Both web and worker must use the same provider configuration.

## Host configuration and scaling

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string, supplied at runtime; never baked into the image |
| `APP_ORIGIN` | Exact browser origin, including HTTPS and any nonstandard port; mutations reject other origins |
| `DEMO_MODE` | Defaults to false in Compose; enables explicit test accounts, gateway and simulated phone codes |
| `ALLOW_PUBLIC_DEMO` | Explicitly permits the startup script to expose demo functionality on a public HTTPS origin |
| `PRIVACY_CONTACT` | Operator contact shown on the privacy page; required by public non-demo container startup |
| `UPLOAD_DIR` | Durable photo directory, `/app/uploads` in Compose; defaults to `.local/uploads` outside containers |
| `RUN_BACKGROUND_JOBS` | Set false in the web process when running the separate worker; local development defaults to embedded jobs |
| `WORKER_HEARTBEAT_FILE` | Worker writes a timestamp after successful processing; used by its container health check |

`src/proxy.ts` issues a fresh script nonce for every request and adds CSP. The root layout renders dynamically so framework scripts receive that nonce. Production scripts do not allow `unsafe-inline` or `unsafe-eval`; inline styles remain allowed for existing React layouts. HSTS and upgrade-insecure-requests are emitted only for a configured HTTPS origin. Test that hydration, media, downloads and SSE work through the actual proxy before launch.

One Node process shares revision polling among clients for the same audience/outlet. Each additional process has its own shared pollers; this is not a cluster-wide broker. Use the measured sustained load tests to set replica counts, database connection limits and SSE limits. A multi-host deployment also needs shared durable upload storage or a storage-service adapter so any replica can serve `/api/media/*`. Never rely on an ephemeral container directory for customer-facing photos.

## Health and operational checks

`GET /api/health` returns only `{ "status": "ok", "database": "reachable" }` on success; failed or slow database access returns HTTP 503. It does not expose credentials or host configuration. Treat this as readiness, not proof that payments, backups, TLS or the entire business operation work.

The separate worker becomes unhealthy when its last successful order-maintenance loop is more than 30 seconds old. Docker's `restart: unless-stopped` handles exited processes; a monitoring system must alert on an unhealthy process, database failure, failing migrations, disk growth and backup age. Test those alerts on the chosen host. The application does not provision monitoring services automatically.

The administrator's **Workspace → Services** page also reads durable per-process reports for order maintenance, payment reconciliation and notification delivery. It shows recent failures, stale or stalled tasks, queue ages and payment recovery references. Apply the `WorkerStatus` migration before restarting the updated processes. A completed pass is not confirmation of provider delivery, and current reports cannot establish whether every expected replica is alive. See [background processing diagnostics](LIVE_SERVICES.md#diagnose-background-processing) for thresholds, retention and interpretation.

Before accepting traffic:

1. Build the image, apply migrations, and verify the health response and expected login mode.
2. Place a sample order, observe the assigned kitchen, advance preparation and delivery, and verify worker-driven delayed settlement/expiry and late alerts.
3. Disconnect/reconnect the kitchen tablet, confirm the last-sync state, and exercise wake lock and audible alerts after a user gesture.
4. Run sustained peak and overload tests against the deployed topology. Keep generated data isolated. Local test traffic does not establish production capacity.
5. Publish verified outlet licences, allergen/photo approvals, business contact and approved retention schedule. Conduct a real two-metre tablet review and observed phone checkout sessions.

## Backups and recovery drill

Choose and document recovery point and recovery time objectives with the operator. For a live service, use managed PostgreSQL backups with point-in-time recovery and encrypted, separately stored upload backups. Monitor successful backups and run a restore drill at least before launch and after significant schema changes.

For a local Compose drill, the following produces a custom-format PostgreSQL dump without printing a password:

```sh
mkdir -p .local/backups
docker compose exec -T postgres pg_dump -U deccan -d deccan -Fc > .local/backups/deccan.dump
docker compose exec -T postgres createdb -U deccan deccan_recovery
docker compose exec -T postgres pg_restore -U deccan -d deccan_recovery --exit-on-error < .local/backups/deccan.dump
```

Use an unused recovery database name each time. These commands do not replace the running database. Take an upload-volume snapshot alongside the database dump; the menu stores references to those files. Validate the restored schema, order counts, sessions and photos in an isolated instance with outbound services disabled. Revoke old sessions before reopening a restored production service. Keep the old release image and schema compatibility notes; app rollback cannot undo an incompatible migration.

Account deletion redacts the active database, not historical backups. Keep a protected erasure ledger outside the snapshot being restored. The `ACCOUNT_ANONYMIZED` audit action and `User.deletedAt` identify completed erasures; export those identifiers to the protected ledger as part of the operational deletion procedure. Before reopening a restored service, reapply every erasure newer than the backup and verify the affected users cannot sign in. A recovery procedure that only restores yesterday's database can resurrect deleted personal details and is not ready for launch. Backup retention and ledger automation must be configured on the selected host; this repository does not claim they already exist.

## Privacy tools and boundaries

The public `/privacy` page describes actual collection and retention behavior and links to signed-in settings. Customers can withdraw marketing consent immediately, download their own account/order/party/reward data as JSON, or delete their account. Export excludes passwords, session tokens, OTP secrets and other customers. Every mutation checks the request origin and the session.

Deletion requires typing `DELETE`, refuses outstanding fulfilment or future confirmed catering, strips contact fields, notes and messages, clears loyalty, disables sign-in and revokes all sessions transactionally. Financial totals, item snapshots, timestamps and anonymous identifiers remain for accounting and aggregate reports. Staff cannot delete their account through customer tools. Completed order history currently has no automatic age-based deletion; choose and implement the business-approved schedule before collecting real customer data. The application does not assert legal compliance from the presence of a privacy page.

Demo phone login uses random six-digit codes, scrypt hashes, a five-minute expiry, five verification attempts, request limits and one-time consumption. A new request invalidates previous codes for the number. Failed attempts are committed even when verification fails. Codes appear on screen only in demo mode; non-demo phone sign-in requires configured AWS SMS or Twilio Verify and establishes ownership only after successful verification. Marketing opt-in is optional and off by default. Existing accounts' preferences do not change merely by signing in again.

## CI and evidence

`.github/workflows/verify.yml` installs locked dependencies on Node 22, generates Prisma, runs domain tests/type checking/build, provisions PostgreSQL 16 on loopback port 55432, runs isolated database/browser verification plus hosted-checkout and non-demo registration browser fixtures, and builds the Docker image. The browser suites run sequentially because they share a port. It retains test results and screenshots for seven days. Provider calls are mocked in CI. A workflow file is not a successful workflow run: check its actual GitHub result after pushing. There is no automatic production deployment or secret configuration in this workflow.
