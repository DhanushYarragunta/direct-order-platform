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

## Origin, secrets and storage

`APP_ORIGIN` self-references the web service's `RENDER_EXTERNAL_URL`. This supported Render feature resolves the actual assigned HTTPS URL; the application does not guess a hostname or trust request headers. For a custom domain, set `APP_ORIGIN` to that exact HTTPS origin and update the Blueprint reference so a later sync does not undo it. Use one canonical origin for login and checkout. Sources: [self-referencing environment variables](https://render.com/docs/blueprint-spec#self-referencing-environment-variables), [Render's default variables](https://render.com/docs/environment-variables).

Both services receive a private-network database connection string from Render. `ipAllowList: []` disables public database access. The web service has `/app/uploads` mounted persistently and `UPLOAD_DIR` points there. The worker does not serve photos and needs no disk. No secret is committed or used as a Docker build argument by the application.

A Render persistent disk is attached to one service instance. It prevents horizontal scaling and causes a brief web-service interruption during deploys. Move uploads to shared object storage before adding replicas. Disk snapshots and managed database backups are separate; validate restore procedures and reapply privacy deletions before reopening restored data. Sources: [persistent disk limitations](https://render.com/docs/disks#disk-limitations-and-considerations), [managed PostgreSQL](https://render.com/docs/postgresql-creating-connecting). See `docs/LAUNCH_OPERATIONS.md` for the broader recovery checklist.

## What remains after deployment

A green deployment confirms hosting, not business launch readiness. Verify the real deployed topology, alerts and backup restoration; run sustained traffic against it before making capacity claims. Human checkout timing and tablet readability need direct observation. Public demo switches must be disabled before accepting real customer data, and the operator must supply verified licences, a privacy contact and an approved retention schedule. Real payment and SMS gateways remain outside this demo's scope.

The configuration uses fields verified in the [official Blueprint specification](https://render.com/docs/blueprint-spec). Local schema validation can check structure; only Render's actual deployment and the checks above confirm the host configuration works.
