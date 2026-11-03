# Update 03 — Core checkpoint verified

Verified on 3 November 2026. The application is ready for the user’s first implementation review and Git commit. No commit or push was made by the agent.

## Evidence

- PostgreSQL migration applied; repeat migration reported no pending migrations.
- Non-destructive seed created/preserved three outlets, four active photographed dishes, six demo accounts and the three sample orders.
- TypeScript passed.
- Twenty domain tests passed.
- Eleven PostgreSQL integration tests passed, including simultaneous checkouts/payments, overlapping background workers, stock refunds, expiry, ownership/outlet isolation, stale versions and late alerts.
- Four Playwright browser scenarios passed: desktop/mobile browsing, customer checkout through delayed payment and kitchen handoff, CMS/availability propagation, and API access-control checks.
- Next.js production build passed using Webpack.
- The repaired dependency installation reported zero known vulnerabilities.
- Desktop/mobile menu, checkout, tracking, CMS and kitchen screenshots were generated and visually inspected. The screenshot helper now resets scroll before capture so fixed navigation is shown at its normal top position.
- The working development server returned HTTP 200 for `/api/menu` at `http://127.0.0.1:3000`.
- Git ignores `.env`, `.local`, `node_modules`, `.next`, and test reports. Original photos are preserved.

Run `npm run verify:core` to reproduce the complete checks. Generated evidence lives in `.local/core-verification.json`, `.local/verification.log`, `.local/screenshots/`, and the Playwright report.

## Concurrency fix explained

The first database run found three real failures. Prisma 7’s PostgreSQL adapter exposed serialization errors from explicit row locks as `P2010`, with SQLSTATE `40001` under `meta.driverAdapterError.cause.originalCode`. The original wrapper only recognized `P2034`.

`src/lib/db.ts` now recognizes both supported shapes, retries only serialization/deadlock states (`40001`/`40P01`), and uses a short bounded backoff. Errors such as access denial and bad input are not retried. The previously failing payment/job/late-alert tests pass with actual concurrent PostgreSQL transactions.

## Run and review

```sh
npm run db:local
npm run dev
```

Open `http://127.0.0.1:3000`, then `/login` for the demo role buttons. Use separate browser profiles/incognito windows to compare customer and kitchen screens simultaneously. The `Customer` account can order; `Admin` manages the menu; `Manager` can change Kondapur promises; each `Kitchen` account sees its own outlet.

Suggested review: add a dish with an extra, complete a test payment, advance it in the correct kitchen, watch customer tracking update, then toggle availability in the menu manager. Review [Update 02](02-core-build.md) for architecture, data flow, assumptions, limits, and interview notes.

## Commit boundary

Suggested message: `feat: build Next.js restaurant ordering core with menu CMS and live kitchen`.

The basic core is complete. Coupons, loyalty, catering, wider CMS capabilities and production deployment remain later checkpoints. FSSAI fields are explicit demo placeholders, payments/messages are simulated, and the preparation estimator is an honest rules-based baseline. Target kitchen-tablet readability and peak-load performance still require deployment/hardware evaluation.
