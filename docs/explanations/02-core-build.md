# Update 02 — Next.js core implementation

This is the implementation record for the first core commit checkpoint. It supersedes proposed details in Updates 00/01 where implementation differs. The original `CLIENT_BRIEF.md` remains authoritative. `PROJECT_SPEC.md` contains a broader proposal; optional bullets there are not claims that those features have shipped.

## 1. What changed and why

The static theme preview is now backed by an actual Next.js application, PostgreSQL data, sessions, API routes, transactional order handling, and live kitchen/customer refreshes. The preview and original photo files remain available as design history.

The reference repository contributed design direction: a charcoal navigation rail, amber selected actions, menu categories, order cards, and an operational workspace. The architecture was implemented in Next.js rather than transplanting the reference’s MERN application. The client explicitly excludes replacing billing/inventory, so table billing and inventory management were not added.

The first checkpoint includes nine route views, with a shared shell and reusable sections: menu/cart, checkout, payment, history, tracking/receipt, sign-in/register, overview, central menu editor, and kitchen display. The extra account/history/overview views are compact supporting screens; the end-to-end core remains the priority.

## 2. Stack actually used

| Part | Implementation and reason |
| --- | --- |
| Application | Next.js 16 App Router, React and TypeScript; one codebase for UI and backend |
| UI | Custom responsive CSS, configured Tailwind, Lucide icons, Radix dialog focus management; no generated food photography or imported dashboard template |
| Storage | PostgreSQL, Prisma 7, PostgreSQL driver adapter; relational constraints and explicit transactions |
| Runtime checks | Zod schemas and bounded request streams; TypeScript is not treated as input validation |
| Accounts | Salted Node scrypt passwords, random opaque cookie tokens, token hashes in database sessions |
| Updates | SSE invalidation backed by database revisions; normal HTTP mutations; twelve-second polling fallback |
| Background work | Persistent payment/expiry/promise deadlines processed by a three-second Node loop |
| Verification | Vitest domain/database tests; Playwright customer/staff, responsive, and security scenarios |

Build uses Next’s supported Webpack mode because Turbopack’s CSS helper attempted a local port bind that the execution sandbox blocks. The production build has been compiled successfully in this mode. The old install contained an incomplete macOS SWC binary; reinstalling that optional package repaired it. Dependencies were upgraded deliberately after the first audit; the subsequent user-run install reported zero known vulnerabilities.

## 3. Files and execution flow

### App shell and browser state

`src/app/layout.tsx` mounts the provider and navigation shell. The provider owns the current account, outlet selection and cart. Only dish IDs, selected options and quantities are persisted in browser local storage. Cart prices are derived for display; they are not trusted at checkout.

`src/lib/client.ts` handles JSON requests and polling/stream subscriptions. Failed requests produce a visible error and retry path. Changing outlet causes its menu and availability to be fetched again. `MenuScreen` presents filters and an accessible customization dialog. `Cart` uses the same state on menu and checkout.

### Creating an order

1. The checkout form submits dish IDs, quantities, options, fulfilment details and a UUID retry key.
2. The route checks the session role and exact request origin, then validates a bounded JSON body.
3. `checkout()` locks the outlet row, verifies open state and delivery radius, reads active menu/availability records and calculates prices from those records.
4. `priceCart()` rejects missing dishes/options, repeated lines/extras and aggregate dish quantities above 20. The limit is an order-size guard, not an inventory count.
5. The order and line snapshots are created together. `(userId, checkoutKey)` is unique; a canonical payload hash rejects reuse of that key for a changed checkout.
6. The user is sent to the test gateway. Unpaid orders never appear as new kitchen tickets.

### Payment and kitchen handoff

`payOrder()` checks order ownership and demo mode. Each attempt has a unique `(orderId, attemptKey)`. A row lock and serializable transaction protect settlement from retries. A failed attempt permits a new attempt. A pending attempt gets a durable settlement deadline; abandoning the browser does not abandon the job.

On successful settlement, availability and outlet state are read again. If an item became unavailable, the attempt becomes REFUNDED and the order becomes CANCELLED, with an explanatory simulated message. Otherwise the order becomes PLACED, receives a preparation promise, and can appear at the appropriate kitchen. Money never actually moves.

The legal kitchen sequence is `PLACED → PREPARING → READY → HANDED_OFF`. The request includes the order version to reject stale actions. Customer cancellation is allowed only while PLACED and simulates a refund. Historical order lines preserve names, portion choices and prices even after menu edits.

### Live updates and recovery

`/api/events` sends small invalidation events, not customer records. Each connection compares database revision/count values every three seconds. Customer streams are scoped to their user; kitchen streams require the correct role and outlet. The session cookie is captured while the request context exists, and the timer rechecks the database session/role instead of reading request cookies later.

On an event the browser reloads authoritative state. A twelve-second interval also refreshes state, so reconnections and missed notifications converge to the database. The UI never depends on replaying every event. Errors are visible. This is near real time, not a guarantee of instant updates or a push-message broker. Polling per stream is an intentional core simplification; a shared change feed is future scaling work.

## 4. Data model and invariants

- **User / Session:** account role and optional staff outlet; hashed token and expiry. Signup always creates CUSTOMER. Marketing opt-in defaults to false.
- **Outlet / MenuItem / Availability / AddOn:** centrally priced menu and outlet-specific availability. The supplied photo library is allowlisted.
- **Order / OrderLine:** immutable commercial snapshots plus evolving stage, version, fulfilment details, deadlines and estimate metadata.
- **Payment:** simulated attempts and durable delayed-settlement deadlines.
- **Message / Audit:** customer-visible mock messages and internal actor/action history. A unique message kind per order prevents repeated late alerts.
- **RateLimit:** database-backed fixed-window login/registration throttling by normalized email.

Money is integer paise. Inclusive GST is `round(total × 5 / 105)`, not another 5% added at checkout. Database constraints additionally enforce positive prices, quantities, totals and kitchen capacity. Prisma’s serializable transaction wrapper retries known serialization failures; integration tests exercise concurrent callbacks and job runs.

No password, local database credential, payment credential or real customer data belongs in Git. SQL locking values are parameterized. The isolated test helper only interpolates its own random, restricted database name into CREATE/DROP DATABASE statements; it refuses non-project-local database targets.

## 5. Preparation estimate and failure behaviour

This build uses transparent automation, **not trained machine learning**:

```text
suggested minutes = ceil(10 + order work / 2 + queued work / active stations)
promised minutes = max(outlet minimum, suggested minutes)
```

Work is derived from dish preparation minutes, family portions, quantity and extras. Current queue work comes from PLACED/PREPARING orders. Invalid numeric inputs fall back to the outlet minimum (30 minutes if that minimum is itself invalid). The queue model is a deliberately simple baseline; it is not calibrated against real restaurant data and may overestimate parallel preparation.

Managers can move a promise to a number of minutes from now, never below the kitchen minimum. The change stores an audit entry and a customer explanation. At ten minutes beyond the current promise, the worker creates one manager alert and a simulated customer message. The kitchen also shows overdue colouring. A restart picks up overdue jobs from persisted timestamps.

## 6. Design, photos and assumptions

The concept name **Deccan Kitchen & Co.**, outlet addresses/coordinates, five-kilometre radius, add-on pricing, default preparation capacity and regular portions are labelled implementation assumptions. The three sample order IDs, dishes, totals and statuses come from the brief. Their times are relative to first seeding so the demo begins with useful active orders. An inactive haleem record preserves the third sample without pretending a missing photo was supplied.

The four originals remain under `Images/`; optimized copies under `public/food/` provide the actual web photography. Chicken uses a portrait crop for the hero/card; vegetable biryani uses its own real photo; salan uses contain-fit so source marks are retained. No rights ownership claim is made. FSSAI fields say `DEMO — licence pending verification` instead of displaying invented licence numbers.

The customer page uses food photography as the visual focus and a short menu. A charcoal sidebar and amber buttons connect it to the reference design. The kitchen favours stable cards, clear quantities, visible time and colour plus text for overdue orders. Responsive layouts use a compact navigation bar on phones and horizontally scrollable kitchen lanes on narrow devices. Reduced-motion preferences and print receipts are supported. Actual readability from two metres still requires testing on the target kitchen tablet.

## 7. Tests and how to reason about them

The 20 domain tests cover trusted pricing, inclusive GST, options, availability, per-dish limits, estimate fallback/load, promise overrides, late thresholds, legal stages, location routing, strict inputs, consent and password hashing. They focus on invariants rather than duplicating UI implementation.

The 11 PostgreSQL integration cases cover duplicate concurrent checkouts/payments, failed and delayed payment paths, overlapping workers, stock changes during payment, expiry, customer/outlet isolation, stage/version enforcement, refunds and unique late alerts. These use a separate temporary database. The full runner retains a machine-readable result and console log under ignored `.local/`.

Four Playwright scenarios cover desktop/mobile real-photo browsing, filters/empty state, cart persistence, checkout and delayed payment, kitchen handoff with live customer updates, menu/availability propagation, forbidden API/stream requests and httpOnly cookies. Screenshots are saved for human inspection. A passing result is claimed only after the actual run completes; see `.local/core-verification.json` and the commit-checkpoint note for current evidence.

## 8. What is deliberately deferred

Coupons, loyalty ledger/redemption, catering requests, schedule menus, city prices, new image uploads, reorder suggestions, production payment/message/delivery integrations and full analytics come after the core checkpoint. The add-on catalogue is seeded rather than separately editable. Authentication uses email/password instead of the earlier proposal’s mock OTP. No webhooks or webhook signature claims are made for the internal mock gateway.

The initial dashboard uses at most 100 recent/active records and is labelled accordingly. The database revision polling approach, session/rate-limit strategy and synchronous password hashing need load evaluation and hardening before a real launch. Demo login is intentionally permissive and must not be enabled with real data. Public deployment and the final two-file assessment package wait for the project’s GitHub URL and the user’s next instruction.

## 9. Interview notes

- **Why one Next.js app?** Customer and staff experiences share one menu/order authority, and deployment is simpler for the assessment. Business modules are separate from HTTP handlers.
- **Why PostgreSQL transactions?** Retries and overlapping staff actions must not create duplicate financial or stage effects. Tests intentionally produce concurrency.
- **Why both events and polling?** Events keep interactions responsive; complete-state refresh recovers after gaps. Data correctness belongs in PostgreSQL, not in the event stream.
- **Is the estimate AI?** It is a rules-based baseline with explicit fallback and manager oversight. Real training requires labelled operational data, error measurement and calibration.
- **What would you build next?** First review the core, then add coupon/loyalty logic with ledger tests, catering, and production integrations based on the client’s priorities.

## 10. Revision notes

- Replaced older vulnerable validation/testing/database dependencies with patched compatible versions.
- Repaired the incomplete local Next compiler package and selected supported Webpack builds for this execution environment.
- Fixed local PostgreSQL startup for workspace paths containing spaces.
- Corrected account registration to return the customer role for navigation.
- Captured SSE session identity before asynchronous timer work and bounded request bodies while streaming.
- Added the core verification runner so failures and screenshots can be inspected without copying terminal logs.
