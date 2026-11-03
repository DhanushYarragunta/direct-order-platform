# Deccan Kitchen & Co.

A Next.js restaurant ordering application for the Company A assessment. The name is a concept brand, not a claim about an existing restaurant. [CLIENT_BRIEF.md](CLIENT_BRIEF.md) is the source of truth; [PROJECT_SPEC.md](PROJECT_SPEC.md) preserves the earlier proposal. The first implementation checkpoint focuses on the brief’s core slice.

## Run locally

Requires Node 22.12+ (built locally with Node 26), npm, and PostgreSQL 16. The local database helper defaults to Homebrew’s `/opt/homebrew/opt/postgresql@16/bin`; set `POSTGRES_BIN` for another installation.

```sh
npm install
npm run db:local
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://127.0.0.1:3000**. Use this exact host because mutations check `APP_ORIGIN`. The setup helper creates a project-owned database on port 55432 and writes random local credentials into ignored `.env`; it never resets an existing database or overwrites an existing `.env`. `npm run db:stop` stops only this project’s cluster.

If npm reports unapproved setup scripts, review with `npm install-scripts ls`, then approve the installed Prisma/engine/esbuild packages and run `npm rebuild`. The package manifest records the setup scripts reviewed for this build.

On `/login`, use the explicit demo buttons for **Customer**, **Admin**, **Manager**, or a selected kitchen. Registration and email/password sign-in also work. Demo accounts use fake `.example` addresses and the local `DEMO_PASSWORD` for password sign-in. The shortcuts and test gateway require `DEMO_MODE=true`.

## First core checkpoint

- Customer menu with the four supplied food photos, category/search/vegetarian filters, outlet selection, geolocation radius checks, portions, add-ons, and a persistent cart.
- Checkout priced by the server in integer paise, including 5% GST. Unavailable items cannot be ordered.
- Simulated UPI/card success, failure, delayed settlement, expiry, retry deduplication, and stock-change refunds.
- Customer order history, live stage tracking, simulated messages, and printable receipt.
- Central menu editor with the supplied photo library, prices, allergens, diet/spice labels, publication state, and outlet availability.
- Kitchen tickets scoped to an outlet, preparation timers, stage actions, availability switches, and manager promise overrides.
- A small operational overview backed by actual demo orders, with honest date/record limits.
- Database sessions, role checks, hashed passwords, bounded validated requests, audit events, and persistent background jobs.

The palette and operational layout draw inspiration from [VedantManek16/Restaurant-POS-System](https://github.com/VedantManek16/Restaurant-POS-System). This is an independent Next.js implementation; it does not replace outlet billing or inventory. The customer menu uses a warm, light surface with a charcoal sidebar and amber accents. Radix provides modal focus behaviour, Lucide supplies icons, and custom CSS defines the interface. Tailwind is configured; this is not an imported shadcn template.

## Verify

```sh
npm run check            # TypeScript, 20 domain tests, production build
npm run verify:core      # Working demo migration/seed + all checks + isolated DB/browser tests
```

The full verification command creates a temporary database on the project-local PostgreSQL server and removes it afterwards. It runs 11 database integration cases plus four Playwright browser scenarios. It does not reset the working demo. Chrome is used when installed on macOS; elsewhere install Playwright Chromium with `npx playwright install chromium`. Port 3001 must be free. A production build is required before running `npm run test:e2e` alone.

Results are written to `.local/core-verification.json` and `.local/verification.log`; browser screenshots are in `.local/screenshots/`. Playwright retains failure traces in `test-results/` and a report in `playwright-report/`. These are ignored by Git.

## Boundaries and next checkpoint

The preparation estimate is a **rules-based baseline**, not a trained AI model. SSE checks database revisions every three seconds, with a twelve-second full refresh fallback. Payments and messages are simulated. FSSAI values are conspicuous placeholders, not valid licences. Supplied images and source marks are retained; confirm image rights before publishing commercially.

Coupons, loyalty, catering, time-based menus, city-specific prices, unrestricted image uploads, customer reorder suggestions, and production deployment are later work. Only Hyderabad prices and three sample outlets are implemented. The initial dashboard is an operational summary, not full analytics. No real delivery provider, WhatsApp/SMS gateway, or payment processor is connected. Load at 1,200 orders/hour has not been benchmarked.

See [deployment.md](deployment.md) for hosting requirements and [the core implementation explanation](docs/explanations/02-core-build.md) for execution flow, tradeoffs, tests, and interview notes. Keep the earlier static `theme-preview/` as design history; the actual application is under `src/`.

## Git checkpoint

The user makes commits and pushes. Review the app, run the checks, and inspect `git status` before committing. Suggested first message:

```text
feat: build Next.js restaurant ordering core with menu CMS and live kitchen
```

Never add `.env`, `.local`, `node_modules`, `.next`, or test reports. Add the project’s GitHub URL and any deployed URL to the final assessment TDD after the repository is created. This README does not invent either URL.
