# Deccan Kitchen & Co.

A Next.js restaurant ordering application for the Company A assessment. The name is a concept brand, not a claim about an existing restaurant. [CLIENT_BRIEF.md](CLIENT_BRIEF.md) is the source of truth; [PROJECT_SPEC.md](PROJECT_SPEC.md) preserves the earlier proposal. The core and remaining product features are implemented for local review.

## Run locally

Requires Node 22.12+ (built locally with Node 26), npm, and PostgreSQL 16. The local database helper defaults to Homebrew’s `/opt/homebrew/opt/postgresql@16/bin`; set `POSTGRES_BIN` for another installation.

```sh
npm ci
npm run db:local
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://127.0.0.1:3000**. Use this exact host because mutations check `APP_ORIGIN`. The setup helper creates a project-owned database on port 55432 and writes random local credentials into ignored `.env`; it never resets an existing database or overwrites an existing `.env`. `npm run db:stop` stops only this project’s cluster.

If npm reports unapproved setup scripts, review with `npm install-scripts ls`, then approve the installed Prisma/engine/esbuild packages and run `npm rebuild`. The package manifest records the setup scripts reviewed for this build.

The `/privacy` page provides the notice, marketing preference withdrawal, account export and customer anonymization/session revocation. Strict nonce CSP and HTTPS-only HSTS protect responses.

On `/login`, use the explicit demo buttons for **Customer**, **Admin**, **Manager**, or a selected kitchen. Registration and email/password sign-in also work. Demo accounts use fake `.example` addresses and the local `DEMO_PASSWORD` for password sign-in. The shortcuts and test gateway require `DEMO_MODE=true`.

## Implemented features

- Customer menu with seven photographed dishes, readable mobile allergens and credited sample photos, category/search/vegetarian filters, outlet selection, GPS/locality-based delivery routing, portions, add-ons, and a persistent cart.
- Checkout priced by the server in integer paise, including 5% GST, outlet delivery fees, minimums and free-delivery thresholds. Unavailable items cannot be ordered.
- Simulated UPI/card success, failure, delayed settlement, expiry, retry deduplication, and stock-change refunds.
- Customer order history, live stage tracking through out-for-delivery and delivered, simulated messages, and printable receipt.
- Central menu editor with secure JPEG/PNG/WebP uploads and the photo library, prices, allergens, diet/spice labels, publication state, and outlet availability.
- Large kitchen tickets with green/amber/red urgency labels, optional sound, wake lock, home-screen manifest, connection status, last synced, preparation timers and manager promise overrides.
- Active kitchen tickets remain visible even after more than 100 newer completed orders; recent terminal history is bounded separately.
- Payment completion removes only the submitted cart quantities once, preserving later additions. Checkout menu errors have a retry action.
- Serializable transactions retry confirmed commit conflicts, including direct errors from the PostgreSQL adapter.
- Coupon validation, loyalty redemption with a transaction ledger, and rewards earned on handoff.
- Party requests with minimum notice and outlet-scoped manager confirmation.
- City price overrides, scheduled menus (including overnight service), and explicit history-based reorder suggestions.
- Outlet reports over all matching orders, with 24-hour/7-day/30-day periods and clear repeat-customer definitions.
- Database sessions, role checks, hashed passwords, bounded validated requests, audit events, and persistent background jobs.

The palette and operational layout draw inspiration from [VedantManek16/Restaurant-POS-System](https://github.com/VedantManek16/Restaurant-POS-System). This is an independent Next.js implementation; it does not replace outlet billing or inventory. The customer menu uses a warm, light surface with a charcoal sidebar and amber accents. Radix provides modal focus behaviour, Lucide supplies icons, and custom CSS defines the interface. Tailwind is configured; this is not an imported shadcn template.

## Verify

```sh
npm run check            # TypeScript, domain tests, production build
npm run verify:core      # Working demo migration/seed + all checks + isolated DB/browser tests
npm run test:performance # 90-second local smoke + automated mobile timing
npm run test:soak        # Isolated five-minute sustained load rehearsal (after build)
```

The full verification command creates a temporary database on the project-local PostgreSQL server and removes it afterwards. It runs 41 database integration cases plus 23 Playwright browser scenarios, alongside 79 domain tests in the full check. It does not reset the working demo. Chrome is used when installed on macOS; elsewhere install Playwright Chromium with `npx playwright install chromium`. Port 3001 must be free. A production build is required before running `npm run test:e2e` or `npm run test:performance` alone. Production type checks exclude transient development-generated routes so a running dev server can regenerate its own files independently.

Results are written to `.local/core-verification.json` and `.local/verification.log`; browser screenshots are in `.local/screenshots/`. Playwright retains failure traces in `test-results/` and a report in `playwright-report/`. These are ignored by Git.

The separate performance suite offers 30 orders over 90 seconds across three outlets, with six synthetic customer sessions and three live kitchen screens. It also times five automated mobile pickup checkouts. Results go to `.local/performance-*.json`; methodology and checked results are in [docs/PERFORMANCE.md](docs/PERFORMANCE.md). This small local sample does not establish production capacity or human checkout speed.

## Review and boundaries

The preparation estimate is a **rules-based baseline**, not a trained AI model. SSE shares three-second revision polling per audience/outlet within each Node process, batches session validation, and uses a twelve-second stale-stream recovery fallback. Payments and messages are simulated. FSSAI values are fourteen-digit, zero-prefixed demo identifiers, visibly labelled as invalid licences. Admin licence declarations require a verification note; the app does not verify with FSSAI. Supplied images and source marks are retained; confirm image rights before publishing commercially.

Three Hyderabad outlets and seven photographed active dishes demonstrate the flows. City pricing is configurable; other-city expansion is not claimed. Coupons are seeded policies. Photo uploads are admin-only, bounded, decoded, stripped of metadata and stored as WebP. Reports include both within-period repeats and mature 30-day retention cohorts, timed checkouts, and exact-period direct/app-order ratios from aggregate app baselines. No real delivery provider, WhatsApp/SMS gateway, or payment processor is connected. Docker/Compose, a Render Blueprint, health checks, CI and an operational recovery runbook are included. The Docker image builds successfully. Public deployment, sustained production peak-load validation and human checkout-time studies remain unverified. Phone OTP is explicitly simulated in demo mode and fails closed outside it.

Start with [the review guide](docs/REVIEW_GUIDE.md), [the current technical design](docs/TECHNICAL_DESIGN.md), [launch operations](docs/LAUNCH_OPERATIONS.md), and [device/load acceptance testing](docs/ACCEPTANCE_TESTING.md). Generated PDFs and ZIPs stay local; source archives use committed Git files only. The repository is [direct-order-platform](https://github.com/DhanushYarragunta/direct-order-platform).

See [deployment.md](deployment.md) for hosting requirements and [Render deployment](docs/RENDER.md) for the self-service deployment steps. The actual application is under `src/`; old design previews, duplicate source photos and generated outputs are no longer retained.

## Repository and launch handoff

Changes are committed in focused checkpoints after verification; publishing to GitHub is separate. `npm run package:source` packages the committed source only, excluding dependencies, builds, credentials, local databases and generated documents. Inspect `git status` before sharing.

The estimator remains a rules-based baseline. No trained-model claim, real SMS/payment gateway, rider app, delivery-app integration, or billing/inventory replacement is introduced. A chosen hosting account/domain, verified business licences/contact/retention decisions, and physical tablet/human/staging acceptance remain external launch inputs.

## Clean project folder

Generated dependencies/builds, previews, duplicate originals, old reports and PDFs/ZIPs have been removed after verification. Reinstall with `npm ci`, then `npm run db:generate` before development. `.env`, `.git`, the local PostgreSQL database and its configuration, referenced uploads and compact verification evidence are retained. Keep them private; source archives and Docker contexts exclude them. Current technical documentation replaces the historical explanation drafts.
