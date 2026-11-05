# Launch acceptance: evidence to collect

The repository contains automated checks and a reproducible sustained-load harness. Passing them locally does not establish production capacity, two-metre kitchen readability or human checkout speed. Record the tester, exact Git commit, build, date, device and environment alongside every result below. Keep failures and retests, not just the final screenshot.

## Kitchen tablet acceptance

Use the actual tablets intended for each outlet, mounted at working height. Record model, physical screen size, browser/version, operating system, orientation, browser zoom, screen brightness and viewing distance. Test landscape at the intended zoom first, then portrait and 200% zoom where applicable. A desktop screenshot is supporting evidence only.

1. Seat or stand at a measured two metres in normal kitchen lighting, then in the brightest realistic lighting. Have at least three kitchen staff each read ten shuffled tickets with different order IDs, quantities, portions, add-ons, notes and pickup/delivery labels. Include long dish names and several items on a ticket.
2. Ask staff to call out the order number, item quantities, modifier, note, time remaining and urgency. Record each answer and response time. Target zero quantity/modifier/note errors, and correct ID/urgency within five seconds in at least 95% of attempts. These are proposed acceptance thresholds for the operator to approve; they are not results already achieved.
3. Confirm green “On time”, amber “Due soon” in the final five minutes and red “Overdue” after the promise, with readable text labels. A manager alert must remain prominent after ten minutes past the original promise. Check that a promise override does not remove the late-alert safeguard and that ready orders are not marked as cooking overdue.
4. Enable sound with a tap. Check the demonstration chime and a newly paid order over the outlet's ambient noise, with the tablet volume set as it will be in service. Confirm an initial page load does not sound for every existing ticket, and a manual refresh does not repeat the alert. Test muted volume and browser audio suspension; record any device limitation.
5. Enable “Keep screen awake”; leave the page visible for at least 20 minutes. Background the browser and return, checking that supported browsers reacquire the wake lock. Confirm the screen-awake label reflects the actual lock. Test low-power mode separately: operating systems may reject or release a lock. Use managed device display settings if the device cannot hold it reliably.
6. Disable Wi-Fi. “Offline” must replace “Live”, the last synced time must remain visible, existing tickets must remain readable and stage changes must be disabled. Restore Wi-Fi: “Reconnecting” must become “Live” and an order placed from another device during the outage must arrive. Also interrupt the database or SSE proxy independently; neither failure may leave a false healthy chip indefinitely.
7. Install the kitchen shortcut using the browser's Add to Home Screen workflow and reopen it. Confirm the icon, staff sign-in and kitchen landing page. The manifest provides a home-screen entry; it does not promise offline ordering or offline mutations.
8. Use a manager and a kitchen account from separate outlets. Confirm dispatch/delivered actions affect only the selected outlet's delivery orders and pickup finishes at handoff.

Record: `device | staff participant | distance | task | answer/correctness | seconds | light/noise | defect | retest`. Obtain the outlet manager's sign-off before calling the display accepted at two metres.

## Human checkout study

Recruit at least 12 representative people who have not rehearsed the flow, on their own target phones. Include smaller screens, older Android/iOS devices and users with accessibility needs. Use a seeded staging environment and simulated payments, and obtain consent for the usability observation. Do not collect real payment information.

Assign balanced, realistic tasks: pickup, delivery by locality/pincode, delivery by GPS, one customization, an unavailable item, and a first-time sign-in. Include people who decline location permission. Use both the expected Wi-Fi and mobile network; record latency/network profile. Do not prompt, prefill or type for participants.

Measure two different clocks:

- **Full observed journey:** start when the participant opens the menu for the assigned task; end when the paid confirmation/tracking page is visible. Include decisions, typing, location selection and sign-in. Record task failures and assistance separately. This is the appropriate evidence for any claim about a person's complete checkout experience.
- **Instrumented checkout:** the application starts its browser timestamp when a cart first becomes visible (direct checkout entry is a fallback), keeps it through login/retry in the tab, and ends at server-confirmed successful payment. This is a client wall-clock metric, not a tamper-proof stopwatch. Demo samples are separated from production/browser samples. It excludes time before the cart becomes visible, so do not substitute it for the full observed journey.

For each group, report the count, completion rate, median, p95, range, abandonment and error rates, plus whether assistance was needed. Keep first-time and returning users, pickup and delivery, and network/device groups separate. A median under 60 seconds is demonstrated only by observed representative-user evidence for the agreed start/end definition. Automated Playwright timing is not human timing. Repeat the study after material changes.

## Sustained peak and overload testing

The 90-second Playwright performance test remains a local smoke check and includes actual browser ticket visibility. `scripts/sustained-load.mjs` adds a configurable native Node load generator for an already running, expendable test environment. It creates synthetic customers, quote/checkout/test-payment workflows, anonymous menu streams, customer order streams and one kitchen stream per seeded outlet. It does not start a server, reset a database, seed data or call a real payment processor.

Run it against a dedicated staging deployment using the same instance sizes, proxy/TLS settings, database tier, worker setup and replica count intended for launch. Seed realistic historical volume first and record the size. Keep demo access limited to the test environment. The script requires an explicit write acknowledgement and checks the demo sign-in endpoint; it must never target the live customer database. Synthetic users are tagged `load-…@load.example` and orders carry the run ID in their note. Restore or discard the test database after saving results.

Example one-hour profile (replace the example hostname with the approved staging origin):

```sh
PERF_BASE_URL=https://staging.example.com \
PERF_ENVIRONMENT=staging \
PERF_ACKNOWLEDGE_WRITES=synthetic-orders-only \
PERF_DURATION_SECONDS=3600 \
PERF_ORDERS_PER_HOUR=1200 \
PERF_CONCURRENCY=12 \
PERF_MENU_STREAMS=60 \
PERF_CUSTOMER_STREAMS=12 \
node scripts/sustained-load.mjs
```

Run the isolated five-minute local rehearsal with `npm run test:soak` after `npm run build`. The wrapper creates/migrates/seeds a temporary database on project-owned PostgreSQL port 55432, starts the production server on port 3001, runs the harness for 300 seconds, stops the server and drops only that temporary database. The working demo is preserved. Do not run it together with browser or existing performance verification because they share port 3001. Set `PERF_DURATION_SECONDS=3600` for a longer isolated local run. Reports are `.local/soak-verification.json`, `.local/soak-verification.log` and the per-run load JSON.

Run a minimum five-minute local rehearsal before spending a staging hour. A 10-second run is useful only for validating the harness. Run a second one-hour test at 1.5–2× expected peak with separate evidence, followed by a return-to-normal recovery period. For the overload run, keep rate limiting enabled and allocate enough distinct customers: the harness defaults to at least 12 and increases the pool with arrival rate to stay below the ordinary payment limit. Dropped arrivals are failures, not silently delayed work; a slow load generator must not make the server look healthy.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PERF_BASE_URL` | `http://127.0.0.1:3001` | Origin of already-running disposable app |
| `PERF_ENVIRONMENT` | `local` | Must be `staging` for remote origins |
| `PERF_ACKNOWLEDGE_WRITES` | unset | Required value `synthetic-orders-only` |
| `PERF_DURATION_SECONDS` | 3600 | Measured offered-load window; warmup and drain excluded |
| `PERF_ORDERS_PER_HOUR` | 1200 | Evenly paced arrival rate |
| `PERF_CONCURRENCY` | 12 | Maximum in-flight workflows; excess arrivals recorded as dropped |
| `PERF_CUSTOMERS` | max(12, ceil(rate/120)) | Distinct synthetic users; production rate limits stay enabled |
| `PERF_MENU_STREAMS` | 30 | Concurrent anonymous menu connections |
| `PERF_CUSTOMER_STREAMS` | min(customers, 12) | Concurrent authenticated order-history streams |
| `PERF_WARMUP_SECONDS` | 30 | Catalogue/stream warmup; minimum stream handshake wait 5s |
| `PERF_DRAIN_SECONDS` | 15 | Final stream propagation observation |
| `PERF_HTTP_P95_MS` | 1000 | Proposed HTTP latency budget |
| `PERF_VISIBILITY_P95_MS` | 8000 | Proposed SSE-triggered kitchen API visibility budget |

The JSON report at `.local/sustained-load-*.json` records configuration, machine, completed/failed/dropped workflows, offered-window completions, arrival lag, median/p95/p99 request and workflow latency, SSE gaps/reconnects, and paid-order-to-kitchen API visibility. It fails on missing workflows/tickets, dropped arrivals, unhealthy/stale streams, budget breaches or generator lag over one second. It uses the kitchen API after each SSE revision; it does **not** measure actual browser paint. Retain the existing browser workload alongside this harness and measure real tablets under that traffic.

Collect host/proxy/database monitoring alongside the report: CPU, memory, event-loop delay, open SSE sockets, PostgreSQL connections and query rate, transaction retries, error rate, worker lag and slow queries. Confirm database polling grows with distinct outlet/audience groups instead of connection count. The shared broker is process-local; each app replica has its own pollers. Anonymous viewers share one menu poller per outlet; kitchen viewers share one poller plus a batched session check per outlet. Authenticated order streams remain isolated by customer.

Use a separate controlled exercise to restart one app replica, pause/restart the worker, interrupt the database and rotate the proxy connection. Record recovery times, lost/duplicate payment or stage mutations, and time for “Live” to return. Verify backup restoration on a fresh database and compare order/payment totals and migration versions. Record exact hosting cost and capacity only after measuring that deployment.

## Evidence status

This document defines work to execute; it is not a record that the one-hour run, actual tablet checks, human study, operational recovery drill or production launch has passed. Store the measured results with build/host identifiers and link them from the release checklist after execution. Business retention and app-order-share baselines require real operational cohorts and comparable aggregate source data after launch; synthetic load accounts must be excluded from those results.
