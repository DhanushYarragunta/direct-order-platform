# Update 00 — Technology stack explained

This document explains the recommended stack for [the original client brief](../../CLIENT_BRIEF.md). It accompanies [the requirements review](00-requirements-review.md). These are proposed engineering choices, not technologies mandated by the employer. This was the pre-build recommendation. The application now exists; see [Update 02](02-core-build.md) for the actual stack, implementation changes and verification.

## 1. Recommendation and why it fits

Use **TypeScript + Next.js/React + Tailwind CSS/shadcn/ui + PostgreSQL/Prisma**, with **Zod validation, cookie-based database sessions, Server-Sent Events, a small background worker, Vitest, and Playwright**.

This project needs three interfaces over the same business data: customer ordering, central menu management, and kitchen operations. One application lets them share pricing rules, types, and access checks while keeping their pages and permissions separate. It reduces integration work during the seven-day assessment and gives you a clear architecture to explain in an interview.

The quality comes from how the pieces are used: correct transactions, a coherent design, reliable updates, useful tests, and clear explanations. Adding more frameworks does not automatically improve the submission.

## 2. Each part, explained from the beginning

### TypeScript — the programming language

JavaScript runs in browsers and on Node.js servers. TypeScript adds type checking during development. For example, an order can define an allowed status and a numeric total rather than accepting arbitrary values everywhere.

**Where we use it:** UI components, server handlers, pricing functions, prep-time calculations, background jobs, seed scripts, and tests.

**What it connects:** shared types help a menu response, a cart item, and the code consuming them agree on their structure. We expose safe response types rather than sending full database records with private fields to the browser.

**Why it fits:** one language is easier to follow across the complete order flow. Refactoring a field can reveal affected code through type errors.

**Limit:** types are not security checks. A malicious request or broken external response can contain values that the TypeScript compiler never sees. Zod and server-side business rules handle that boundary.

### React and Next.js — the interface and application framework

React builds the interface from reusable components such as a food card, customization sheet, cart row, and kitchen order card. Next.js uses React and adds routing, server rendering, and backend route handlers.

**Where we use them:** the customer pages, `/admin`, `/kitchen`, sign-in screens, and server endpoints used by these screens.

Use server rendering for suitable initial reads and client components where browser interaction is needed: quantity controls, cart state, sheets, and live order updates. This boundary will be explained for every relevant file.

**Why it fits:** all three interfaces share a menu, outlet model, and order model. One Next.js app can host them while giving each a different layout and permission scope.

**Important distinction:** a page displaying a button does not grant permission to perform that action. The server checks every protected operation, including requests made outside the UI.

### Node.js and Next.js route handlers — the backend

Node.js is the server runtime that executes our JavaScript. Next.js route handlers are the functions that process HTTP requests on that server. They are a real backend, even though they live in the same repository as the pages.

**Where we use them:** checkout, payment callbacks, sign-in, menu administration, stock changes, order-stage changes, and event streams.

A checkout handler will validate the request, identify the customer, read trusted menu prices, check outlet availability, calculate the total, and create the pending order. The browser cannot authorize its own discount or declare its own payment successful.

**Why this over a separate Express/Fastify service initially:** a separate service is valid but adds deployment configuration and an additional boundary to maintain. The core does not require it. Business logic will live in dedicated modules rather than being packed into route files, so a future extraction remains possible.

### Tailwind CSS — layout and visual styling

Tailwind provides small styling utilities for spacing, typography, color, layout, and responsive behavior. We will define shared design tokens so values are consistent across pages.

**Where we use it:** mobile food browsing, tablet kitchen layouts, desktop admin forms, readable type, clear spacing, and visible focus states.

**Why it fits:** it makes responsive implementation efficient while still allowing a custom design. It does not decide the brand, hierarchy, photography, or checkout flow for us.

### shadcn/ui — selected interface building blocks

shadcn/ui provides component code that can be added to and customized within the project. Useful examples include dialogs, sheets, buttons, form controls, and menus.

**Where we use it:** customization sheets, payment-method controls, administrative forms, and other interactions that benefit from established component patterns.

**Why it fits:** it saves time on reusable interaction foundations. We still verify focus handling, labels, keyboard behavior, touch targets, and the final composed UI. Using a component collection does not guarantee an accessible finished page.

**Design commitment:** the customer app should feel specific to a Hyderabadi restaurant. We will customize typography, colors, food imagery, spacing, and component presentation instead of leaving a default dashboard appearance.

### CSS transitions — smoothness

Begin with short CSS transitions for buttons, sheets, opacity, and small state changes. Prefer properties such as opacity and transform that generally avoid repeated layout work.

**[DESIGN ASSUMPTION]** Approximately 150–220 ms is a starting range, adjusted after testing. Respect reduced-motion preferences. Adding an item or submitting payment must not wait for decorative animation.

A library such as Motion is optional if a specific interaction later needs coordinated layout or gesture animation. It is not necessary for every hover or button press. The kitchen should use minimal motion because staff need stable, readable information on inexpensive tablets.

Smoothness also depends on image sizes, reserved image dimensions, rendering work, loading feedback, and network behavior. An animation library cannot repair a slow checkout or oversized food images.

### PostgreSQL — permanent, authoritative storage

PostgreSQL stores users, outlets, menu items, orders, order lines, payments, and events. Optional loyalty and coupons add related records later.

**Why it fits:** these records have relationships and consistency rules. One order belongs to one customer and outlet; it has several line items and possibly several payment attempts.

A transaction groups related updates. For example, processing payment success should settle the attempt and advance its order consistently. Unique constraints and carefully chosen locks or atomic updates prevent duplicate business effects when requests overlap.

**Important limit:** a transaction alone is not enough if its queries allow a race. We need the correct constraints, update conditions, and isolation/locking where necessary, with tests against PostgreSQL.

The cart shown in a browser is temporary client state. The accepted order in PostgreSQL is the durable record. Editing the current menu must not rewrite historical receipt prices; order lines keep appropriate snapshots.

### Prisma — the database access layer

Prisma is an ORM: it maps database tables and relationships to an API usable from TypeScript. Its schema and migrations make database structure changes explicit.

**Where we use it:** queries for menus and orders, writing checkout records, scoped kitchen reads, and database migrations.

**Why it fits:** the schema is readable and generated types help connect database fields to server code. It is suitable for explaining how each model participates in the order flow.

**Limit:** Prisma does not replace PostgreSQL knowledge. We still choose indexes, avoid unnecessary repeated queries, handle transaction races, and sometimes use carefully parameterized SQL for locking or database-specific behavior. Drizzle is a good alternative, but using both would add little value here.

### Zod — checking incoming data

Zod validates actual runtime values. A quantity can be required to be an integer within a sensible range; an item identifier must have the expected shape; an unsupported order status can be rejected.

**Where we use it:** request bodies, path parameters, query parameters, and useful shared form validation.

**Connection to business rules:** passing Zod means the input has an acceptable shape. It does not prove the item is in stock, the user owns the order, or the total is correct. Those checks happen against trusted server state.

### Database sessions and secure cookies — authentication

After sign-in, the server creates a session and gives the browser an opaque session identifier in a cookie. The server uses the session to identify the user on later requests.

**Proposed flow:** mock mobile OTP for demo customers; password-based staff/admin login; hashed passwords; server-side session expiry and revocation. Select a maintained authentication library compatible with the chosen Next.js release and required flows during implementation; do not build custom cryptographic primitives.

Use httpOnly cookies so ordinary browser JavaScript cannot read the session token, Secure cookies over HTTPS, appropriate SameSite settings, and CSRF/same-origin protection for mutations. Rate limits and OTP expiry still matter even in a demo login flow. A fixed OTP is enabled only in explicit demo mode.

**Authentication versus authorization:** authentication identifies the person. Authorization decides which operation that person may perform. A kitchen user must be limited to their outlet even if they manually send another outlet ID.

**Why sessions fit:** this is one browser application, and database-backed sessions make logout and revocation straightforward. A JWT system can work, but it is not inherently more secure or necessary for this use case.

### Server-Sent Events — live kitchen and customer updates

SSE lets the server maintain an HTTP response through which it sends events to a browser. The browser can use `EventSource` to receive them.

**Where we use it:** notify the right kitchen when a paid order arrives and update customer tracking when staff change a stage. The kitchen's Accept, Ready, and Handoff actions use ordinary authenticated HTTP requests.

**Why it fits:** the continuous flow is primarily server-to-browser. We do not need a bidirectional socket protocol just to notify clients of committed changes.

**Recovery:** use heartbeats, disconnect cleanup, a visible connection indicator, and state refetching after connection/reconnection. A five-second polling fallback can refresh the screen while streaming is unavailable. Recover from missed events without duplicating cards or repeatedly chiming for old orders.

**Security:** streams are authenticated and scoped. A kitchen stream receives only its authorized outlet's events; a customer sees only their own orders. Do not broadcast all private data and rely on client-side filtering.

**Initial deployment assumption:** one application instance may publish events in-process after database commits, provided the deployed server's process/module behavior is verified. If multiple instances are used, a shared transport such as PostgreSQL LISTEN/NOTIFY is needed. That transport is not a permanent event log; PostgreSQL order records remain authoritative and clients refetch after gaps.

### Background worker — tasks that must run without a browser

A small Node.js worker processes persisted work: mock payment delays, unpaid-checkout expiry, and orders ten minutes beyond their promise.

**Why it fits:** a browser timer stops being useful when the browser closes. A request-local timer can disappear on a restart. The worker reads durable deadlines and processes them safely again after interruption.

**Safety:** repeated execution must not send repeated late alerts, apply payment success twice, or release the same reservation twice. Use database uniqueness/state checks. The worker shares business modules with the application, rather than duplicating payment rules.

### Mock payment gateway — a controlled test integration

The original brief explicitly allows mocked payments and outside systems. Build a clearly labelled test gateway supporting the chosen UPI/card demo methods and success, failure, pending, and abandonment behavior.

**Why it fits:** reviewers can deliberately exercise edge cases without a real merchant account or real money.

**Recommended engineering depth:** validate signed callbacks, use idempotency keys, recheck fulfillment availability, and define late-success/refund behavior. These are implementation choices that demonstrate correctness; the original brief does not mandate a particular gateway SDK or webhook protocol.

### Prep-time estimator — domain logic, not a required vendor

The brief asks for a working AI prep-time estimate and failure/override behavior. It does not name an AI model, provider, or training dataset.

**Proposed starting assumption:** implement a transparent rules-based estimator in TypeScript using quantities, preparation effort, current kitchen load, and configured capacity. Apply the outlet minimum, log manager overrides, and trigger the required late alert/customer update. Missing or invalid inputs need an explicit conservative fallback and visible reason.

This is a functioning estimator but is not a trained machine-learning model. We must say that plainly in the TDD and interview. The brief's phrase "AI or automation" offers implementation flexibility, but we cannot guarantee reviewer preference for a heuristic. If we choose a learned model, we must explain its training data, evaluation, limitations, and fallback. Synthetic data is not evidence of real prediction quality. Using AI tools during development is separate from this product feature.

### Vitest and Playwright — logic and browser verification

Vitest runs fast tests for pure calculations and server behavior. Use a dedicated PostgreSQL test database for transaction, constraint, and concurrency checks; mocked database calls cannot establish those guarantees.

Playwright operates a real browser. It can choose an outlet, customize food, check out, simulate payment, and verify the kitchen and customer screens update. It also helps check keyboard navigation, mobile viewports, and failure states.

**Why both:** correct functions do not prove the Pay button reaches them, and a successful browser happy path does not prove payment callbacks are race-safe. Manual touch/device and visual review complement automated tests; a phone-sized viewport alone is not proof of performance on a cheap Android tablet.

### Long-running Node hosting and managed PostgreSQL — deployment

Render or Railway are reasonable candidates for a long-running Node service plus PostgreSQL, subject to available plans and verified streaming/worker support. Choose the actual provider before deployment based on the user's account and costs; no provider has been selected or provisioned yet.

**Why this hosting model:** persistent SSE connections and a worker are straightforward to reason about. Check process counts, proxy timeouts/buffering, heartbeat behavior, service sleep, database connection limits, and persistent image storage. Some platforms can stream from serverless functions with limits, but they require additional lifetime/reconnection planning.

Do not promise a free, always-on deployment without checking the provider. The original assessment requests a live link if deployed; a reliable deployment is strongly recommended for demonstration.

## 3. How the pieces connect when someone orders

1. **React/Next.js** displays the serving outlet's menu, styled with **Tailwind** and selected **shadcn** components.
2. A customer changes quantities and submits checkout. **TypeScript** helps us write consistent code, but the request is still untrusted input.
3. A **Next.js route handler on Node.js** checks the session and validates the request with **Zod**.
4. Server pricing and availability logic reads trusted data through **Prisma** from **PostgreSQL**, then creates the pending order in a transaction.
5. The mock gateway produces a payment result. The callback handler verifies it and applies it once, even if sent repeatedly.
6. The server computes the preparation promise and commits the order as placed. An **SSE event** tells the authorized kitchen to update.
7. Staff move the order through its stages using authenticated requests; the server validates each transition, saves it, and notifies the customer's live screen.
8. A **background worker** checks deadlines and records one late alert/customer update when required, even if no browser is open.
9. **Vitest** checks calculations and server guarantees; **Playwright** checks that the full interaction actually works.

## 4. Scale and performance in this brief

1,200 orders/hour is about 20/minute or 0.33 orders/second across the chain. This average is not the same as peak simultaneous checkouts, total page requests, connected tracking sessions, or database workload.

A well-built single application with PostgreSQL is a reasonable starting design at this stated volume, subject to realistic measurement. Use indexes for outlet/status/time queries, bounded result sets, efficient image delivery, scoped streams, sensible connection pooling, and avoid one extra database query per displayed row. Test bursts and long-lived connections before claiming a capacity figure.

## 5. Alternatives and what would justify changing the choice

| Alternative | When it would make sense | Why it is not the current recommendation |
|---|---|---|
| React/Vite plus Express or Fastify | Separate API deployment, independent clients, or strong familiarity with that setup | Adds an integration/deployment boundary for this one browser product; still a valid choice if you know it much better |
| MongoDB | A genuinely document-oriented data model and a team comfortable with its consistency patterns | This application's payments, order lines, outlet permissions, and optional ledgers naturally fit relational tables and constraints; MongoDB is not incapable of transactions |
| Drizzle | Preference for SQL-oriented TypeScript schemas and queries | Prisma provides a readable starting schema; the choice does not justify maintaining two ORMs |
| WebSockets/Socket.IO | Substantial bidirectional real-time communication or socket-specific features | Kitchen actions already fit normal HTTP and notifications fit SSE |
| A separate ML service | A model requiring its own runtime, data pipeline, or independent deployment | The original names no such service; adding one without a justified model increases maintenance |
| Redux/Zustand | Complex cross-page state that becomes difficult with simpler React state | Start with scoped React state/context and a cart reducer; server orders and permissions remain authoritative |

The employer does not prescribe this stack. Familiarity can outweigh small framework advantages during seven days. The TDD should explain the chosen tradeoffs instead of claiming one stack is universally best.

## 6. Interview questions with short answers

**Why one full-stack Next.js application?** Three interfaces share one domain and database. One deployment reduces setup work while modules and authorization keep responsibilities separate.

**Is Node.js another frontend framework?** No. Node.js runs JavaScript on the server. React builds interfaces, and Next.js coordinates application routing/rendering plus server endpoints.

**Why do we need both Prisma and PostgreSQL?** PostgreSQL stores and enforces the data. Prisma is the TypeScript interface used to query it and manage schema migrations.

**Why TypeScript and Zod together?** TypeScript checks our code at development time. Zod checks real runtime inputs. Neither replaces authorization or trusted pricing.

**Why PostgreSQL for orders?** Orders relate to customers, outlets, lines, and payments. Transactions and constraints support consistent updates under retries and concurrency.

**Why SSE rather than WebSockets?** Most continuous traffic is server notifications. Browser actions can use HTTP. SSE supports this simply, with scoped streams and reconnection recovery.

**What if a live event is lost?** Refetch the authoritative database-backed state on reconnect and use polling during streaming failure. A notification is not the permanent order record.

**Why have a worker if Next.js already has a backend?** Some work is due later and must run without a request or open browser. Persisted deadlines survive navigation and process restarts.

**Does shadcn make the application accessible automatically?** No. It offers useful foundations, but our composition, labels, focus behavior, contrast, and keyboard/touch interactions need verification.

**Will adding Motion make the application fast?** No. Motion concerns animation behavior. Image size, rendering cost, network latency, stable layouts, and responsive feedback determine much of perceived performance.

**Why not put session tokens in localStorage?** Browser JavaScript can read localStorage. A properly configured httpOnly cookie reduces token exposure to scripts; other controls, including CSRF protection and session expiry, are still necessary.

**How would you prove payment correctness?** Test duplicate and concurrent checkout/callback requests against PostgreSQL, verify unique outcomes and allowed state transitions, and check that failure/expiry paths leave consistent records.

**Which part is AI?** The proposed baseline is a real load-aware rules-based estimator, described as an assumption. It is not trained ML, and we must not claim it is. Its inputs, uncertainty handling, minimum-time rule, overrides, and late alerts are demonstrable and testable.

**Why not implement all optional features immediately?** The assessment prioritizes a complete polished core. Extra modules are valuable only after the core works and enough time remains to test and explain them.

## 7. File and commit notes

This is a documentation-only file within the same update 00 checkpoint. It introduces no runtime dependencies, migrations, or application behavior. You make the commit; the updated command listing is in [the requirements review](00-requirements-review.md#11-review-verification-and-commit-checkpoint).

## 8. Quick revision summary

- **Language:** TypeScript makes the frontend/server code easier to keep consistent; it does not validate untrusted requests at runtime.
- **Application:** Next.js uses React for the customer, admin, and kitchen UI and route handlers on Node.js for the backend.
- **Design:** Tailwind sets consistent responsive styling; shadcn supplies customizable components; short CSS transitions provide restrained motion.
- **Database:** PostgreSQL stores authoritative records and supports transactions; Prisma supplies typed access and migrations.
- **Validation/auth:** Zod checks incoming values. Database sessions in secure cookies identify users. Server authorization restricts actions and outlet/order access.
- **Live updates:** SSE pushes committed changes; regular HTTP handles staff actions; refetching and polling repair interruptions.
- **Worker:** Persisted tasks handle mock payment delays, expiry, and ten-minute late alerts without relying on a browser.
- **Payments/estimator:** Mock external payments with real correctness checks. Use a clearly labelled load-aware estimator assumption and demonstrate its safeguards; do not claim trained AI unless one is implemented.
- **Verification:** Vitest for logic/server behavior, PostgreSQL integration tests for races and constraints, Playwright for real browser flows, plus visual/device review.
- **Hosting:** A verified long-running Node service, worker, and managed PostgreSQL are a straightforward deployment model; provider and cost remain to be selected.
- **Why it fits:** One understandable application supports three experiences, protects order/payment data, and leaves time for polished UI and explanation within the seven-day assessment.
