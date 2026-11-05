# Local performance evidence

Verified on 4 November 2026. These measurements are a bounded synthetic sample on a local production build, not a production capacity guarantee or a human usability study.

## Reproduce

```sh
npm run db:local
npm run build
npm run test:performance
```

The runner creates, migrates and seeds a new `deccan_test_*` database on the project-owned PostgreSQL server at loopback port 55432. It starts a production server on port 3001, then stops it and removes the database. The working demo is preserved. Do not run this command together with `test:e2e` or `verify:core`; they share port 3001. Use Chrome on macOS, or install Playwright Chromium elsewhere.

## Workload and environment

- Apple M5, ARM64, 10 logical CPUs; Darwin 27.2.0; Node v26.12.1; PostgreSQL 16; Next.js 16.4.4 production build; local browser and database.
- Six signed-in synthetic customer sessions and three live kitchen browser screens, one per seeded outlet. Fake `.example` accounts are confined to the temporary database.
- Ten bursts of three simultaneous orders, every nine seconds, within a 90-second observation window. This offers 1,200 orders/hour for that short window.
- Every order requests a server quote, creates a checkout, and completes immediate simulated UPI/card payment. Totals, paid state and outlet routing must agree. Each order must become visible on its kitchen screen; all three screens must receive fresh SSE events.
- Catalogue requests are warmed before timing. Initial sign-in, physical cooking, delivery, real gateways, WAN latency and a full hour of sustained traffic are excluded. The local review dev server was also running.

## Checked results

| Measurement | Result |
| --- | --- |
| Completed paid orders within 90 seconds | 30/30 |
| Equivalent completion rate within that window | 1,200 orders/hour |
| Measured quote/checkout/payment HTTP requests | 90 |
| HTTP errors / failed workflows | 0 / 0 |
| Quote median / p95 | 19.2 / 44.6 ms |
| Checkout creation median / p95 | 35.5 / 84.6 ms |
| Payment median / p95 | 9.9 / 44.9 ms |
| Full API workflow median / p95 | 68.1 / 201.7 ms |
| Paid order to visible kitchen ticket median / p95 | 1.81 s / 2.84 s |
| Automated mobile flow median / p95, five runs | 0.32 s / 1.92 s |

Percentiles use the nearest-rank method. With only five mobile samples, p95 is the maximum. The mobile flow uses five fresh signed-in browser contexts at 390 x 844, starts at an already loaded menu, adds a dish, enters a fake phone number, pays in test mode and waits for tracking. It excludes human decision/typing time, sign-in and initial menu loading. It does **not** validate the client's under-60-second human checkout target.

The initial concurrent run exposed unhandled serialization failures at database COMMIT. The retry policy now recognizes the PostgreSQL adapter's direct conflict errors while preserving Serializable isolation and a four-attempt limit. A database regression forces that exact error and verifies that each committed write is applied once. Connection failures with uncertain commit state are not retried automatically.

## Evidence and remaining validation

Running the smoke suite writes `.local/performance-throughput.json`, `.local/performance-checkout.json`, `.local/performance-verification.json` and `.local/performance.log`. Historical generated files were removed during cleanup; the values above preserve the reviewed summary. Re-running the command recreates the reports. The normal verification suite separately passed 55 domain tests, 30 database cases, 13 browser scenarios, TypeScript and the production build.

Before claiming production readiness, run sustained peak and overload tests on the chosen host with realistic catalogue/order history, customer streams, slow networks and the intended outlet count. Measure checkout with representative people on target phones, including location and sign-in. Validate kitchen readability on actual tablets at two metres. Adoption and repeat-customer targets require operational data after launch.

## Quality revision: five-minute sustained local rehearsal

Verified on **5 November 2026** with `npm run test:soak`, using an isolated database and the updated production build. The runner completed **100/100 paid orders in a 300-second arrival window**, paced at 1,200 orders/hour, with 12 synthetic customers, 30 anonymous menu streams, 12 customer streams and 3 kitchen streams. Warmup was 30 seconds and the final drain was 15 seconds. No dropped arrivals, failed workflows, HTTP errors, missing kitchen orders, stream errors or reconnects occurred.

| Measurement | Median | p95 | p99 |
| --- | ---: | ---: | ---: |
| Quote | 11.36 ms | 13.64 ms | 16.74 ms |
| Checkout creation | 9.57 ms | 13.72 ms | 23.91 ms |
| Simulated payment | 11.39 ms | 13.52 ms | 17.84 ms |
| Full API workflow | 32.57 ms | 38.30 ms | 44.76 ms |
| Paid to kitchen API visibility after SSE | 91.54 ms | 146.54 ms | 148.56 ms |

Maximum visibility was 2.99 seconds. This harness measures SSE-triggered kitchen API visibility, not browser paint, physical preparation, delivery or human input. The arrival cadence can align with polling and is not a prediction of general WAN latency. The Apple M5 / Node 26 / local PostgreSQL environment matches the earlier local setup. The previous 90-second browser sample remains historical evidence for the earlier implementation, not a rerun of these changes.

Evidence: `.local/sustained-load-mw3eqs1j.json` and `.local/soak-verification.json`; the temporary server and database were removed successfully. Full current functional checks passed: **79 domain, 41 database, 23 browser scenarios, TypeScript and production build**. The deployed Render topology still needs its own sustained peak/overload test. See `ACCEPTANCE_TESTING.md` for the one-hour staging protocol and observed human/two-metre tablet sessions. No business target is claimed as achieved.

After the requested folder cleanup, compact current evidence remains in `.local/quality-verification.json`, `.local/soak-verification.json` and `.local/sustained-load-mw3eqs1j.json`. Screenshots/builds/dependencies were removed; run `npm ci`, `npm run db:generate` and the verification commands to regenerate them.
