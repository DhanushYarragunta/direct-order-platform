# Update 00 — Requirements, technology choices, and corrections

Reviewed: 2 November 2026.

Source of truth: [CLIENT_BRIEF.md](../../CLIENT_BRIEF.md), the original employer brief subsequently supplied by the user. [PROJECT_SPEC.md](../../PROJECT_SPEC.md) preserves the earlier uploaded implementation proposal unchanged. Where they differ, the original brief controls. Recommendations below are engineering choices, not additional employer requirements; record adopted assumptions in the TDD.

**Correction after receiving the original brief:** the earlier version of this review incorrectly promoted loyalty and coupons to final acceptance requirements based on the derived checklist. They are optional depth beyond the core. The original confirms seven days from the assessment opening, permits mock external systems, and does not prescribe an AI model or technology stack.

## 1. What this update contains

This is a documentation update. There is no application code yet.

| File | Purpose | Connection |
|---|---|---|
| `CLIENT_BRIEF.md` | Original client and assessment brief, with normalized formatting | Authoritative requirements, scope, assessment rules, and submission format |
| `PROJECT_SPEC.md` | Unchanged derived implementation proposal | Gives the numbered sections reviewed below; contains assumptions beyond the original brief |
| `docs/explanations/00-requirements-review.md` | Explains the project, recommended choices, gaps, tests, and interview reasoning | Guides later implementation and its explanation files |
| `docs/explanations/00-tech-stack.md` | Explains each technology, its purpose, alternatives, connections, and interview answers | Expands the stack recommendation below without installing dependencies |

Your working rules take priority over the document's instructions to a coding agent. In particular, **you make every Git commit and push**. Each meaningful update will include a separate explanation, verification results, a quick revision summary, and a suggested commit message. We will finish one update before moving to the next commit checkpoint.

The assessment allows **seven days from when the step opens**. Its actual opening timestamp has not been provided, so the calendar deadline is still unknown. The client's ₹9 lakh/eight-week project context is separate from this assessment deadline. Detailed teaching, testing, and design refinement must be included when estimating the work. The assessment is individual work with AI assistance explicitly encouraged; you must understand and own the final decisions.

## 2. What the project is solving

A Hyderabad restaurant chain wants customers to order directly from its own website. It wants to reduce marketplace fees, manage its own menu, maintain customer relationships with appropriate consent, and send paid orders directly to the correct kitchen.

The product is three connected experiences: a customer ordering website, a central menu administration interface, and an outlet-specific kitchen display. A good submission must demonstrate the complete connection between them.

The business case arithmetic in the file is consistent: ₹52.8 crore in app sales × 12% migration × 15 percentage points of cost savings = ₹95.04 lakh. Recovering 30 bulk orders monthly × ₹18,000 × 30% margin × 12 months adds ₹19.44 lakh. Total projected annual benefit is ₹114.48 lakh, or approximately ₹1.14 crore. These are projections based on supplied assumptions, not measured results or guaranteed savings.

The strongest demonstration is: choose a delivery location → browse the serving outlet's menu → customize food → pay through the mock gateway → see that order appear in the correct kitchen → advance its preparation → watch the customer's status update.

## 3. Is the proposed technology stack good?

**Yes. The TypeScript, Next.js, PostgreSQL stack fits this project well.** The specification gives alternatives rather than a completely finalized stack. The following choices keep the first implementation manageable and easy to explain.

Read [the detailed technology-stack explanation](00-tech-stack.md) for beginner-friendly definitions, the complete order flow, alternatives, interview questions, and its own quick revision summary.

| Area | Recommendation | Why it fits / tradeoff |
|---|---|---|
| Language | TypeScript | Shares vocabulary and types across the UI and server. Runtime input validation is still necessary because types disappear when the program runs. |
| Web application | Next.js with React | Supports customer, admin, and kitchen routes in one application. Use server components for suitable reads and client components for cart interaction and live updates. |
| Styling | Tailwind CSS and selected shadcn/ui components | Speeds up consistent spacing, forms, sheets, and dialogs. Components still need brand styling and accessibility checks. |
| API | Next.js route handlers initially | Enough for the required backend without also building and deploying a separate Fastify service. Reconsider Fastify if independent scaling or another client genuinely needs it. |
| Database | PostgreSQL | Transactions, constraints, and relationships suit orders, payments, coupons, and loyalty. |
| Database access | Prisma | Readable models, migrations, and queries suit a learning-focused project. Raw SQL or explicit locking may still be needed for concurrency-sensitive operations. Drizzle is a valid alternative, not a necessary addition. |
| Validation | Zod | Rejects invalid bodies, route parameters, and query parameters at runtime. Server authorization and business checks remain separate. |
| Authentication | Database-backed sessions in secure, httpOnly cookies | Straightforward logout and revocation for this browser application. Customer OTP is mocked only in demo mode; staff passwords are hashed. |
| Real-time delivery | Server-Sent Events (SSE) and a five-second polling fallback | Server pushes new orders and status changes; the browser sends kitchen actions through normal API requests. WebSockets are unnecessary for this direction of communication. |
| Initial event transport | In-process events after committed DB changes, on one application instance | Fits the stated single-instance option. Reconnection refetches authoritative data. Multiple instances need shared events, such as PostgreSQL LISTEN/NOTIFY; notifications themselves are not durable history. |
| Background tasks | A small worker using persisted DB state | Processes delayed mock payments, payment expiry, and late-order alerts even when browser pages are closed. Jobs must be safe to retry. |
| Tests | Vitest, real test PostgreSQL integration tests, and Playwright | Unit tests verify calculations; integration tests verify transactions and access; browser tests verify actual interactions. Playwright is recommended here because you explicitly want buttons and complete flows tested. |
| Hosting | A long-running Node service and managed PostgreSQL | Fits the specification's SSE deployment requirement. Check streaming support, proxy buffering, idle timeouts, worker execution, image storage, and free-tier sleep behavior before choosing a provider. |

We do not need a separate frontend repository, microservices, Redis, or an LLM just to implement the core. Extra infrastructure should follow a concrete requirement. A deterministic estimator is discussed separately below because the specification calls it AI.

**[PROPOSED STRUCTURE]** A single application can begin with `src/app`, `src/components`, `src/features`, `src/lib`, `prisma`, `tests`, and `docs/explanations`. This is simpler than introducing a monorepo for one app. Folder and file responsibilities will be explained when they are actually created.

## 4. Requirements explained section by section

| Spec section | What it means in practice |
|---|---|
| 0 — Coding rules | Finish a working core, validate inputs, seed data, and avoid dead controls. Its instruction to commit is superseded by your instruction that you commit manually. |
| 1 — Client | The product belongs to a restaurant chain with outlets and delivery-only cloud kitchens. Demo data needs at least three locations, not all seventeen. |
| 2 — Current situation | Manual menu updates and disconnected ordering explain why a central menu and direct kitchen routing matter. Existing billing and inventory remain outside this project. |
| 3 — Business case | Explain the financial motivation in the design document and identify the numbers as assumptions. |
| 4 — Client request and users | Customers place orders; kitchen staff handle one outlet; admins maintain the menu. Manager permissions need an explicit decision because later sections require them. |
| 5 — Core build | Customer ordering, mock payment, central menu admin, and a live kitchen display must connect end to end. Prep-time estimation is also required. |
| 6 — Wider features | Includes coupons, loyalty, party orders, analytics, city pricing, and scheduled menus. The original brief explicitly makes the remaining full-scope features optional depth beyond the core. |
| 7 — Exclusions | Do not integrate delivery marketplaces, build a rider app, or replace billing and inventory. |
| 8 — Automation | Route by serviceable location, estimate prep time, reflect stock changes, log mock transactional messages, alert on late orders, and support estimate overrides. |
| 9 — Constraints | Show license numbers, food symbols, allergens, and inclusive GST; capture appropriate consent; keep the kitchen page lightweight. The listed consent controls do not by themselves prove complete legal compliance. |
| 10 — Design | Food photography and a fast mobile checkout support conversion. The kitchen prioritizes legibility and immediate actions. Admin prioritizes efficient editing. |
| 11 — Measures | Record checkout duration and define repeat-customer metrics. Nine-month business targets cannot be demonstrated as actual outcomes in a short demo. |
| 12 — Seed data | Use realistic fake data and the three supplied sample orders with matching totals. The suggested 20–25 menu items, extra customer count, and exact invented unit prices are assumptions, not employer-mandated counts or prices. Demo times need careful treatment. |
| 13 — Architecture | A proposed implementation, not an externally mandated technology list. Document the reasons for the choices we actually make. |
| 14 — Payments | Reprice on the server, create the pending order, handle signed mock callbacks, safely reserve benefits, and prevent duplicate effects. This deserves particularly strong tests. |
| 15 — Data model | A starting model that must be refined for addresses, sessions, jobs, financial reversals, and audit history. Enforce legal status transitions on the server. |
| 16 — Screens | Defines detailed interactions and role-specific behavior. Its account screen and manager controls exceed the earlier eight-screen outline. Count working flows rather than forcing an arbitrary screen total. |
| 17 — Security and testing | Check permissions on every relevant server operation, protect sessions and uploads, validate payments, and test important failure paths. |
| 18 — Build schedule | A planning example. Complete vertical slices and prioritize correctness over adding partially working optional modules. |
| 19 — Submission | Confirmed by the original brief: one ZIP up to 25 MB containing exactly a TDD in PDF or Word and `deployment.md`; the GitHub URL belongs at the top of the TDD. A live link is requested if deployed; deployment is strongly recommended for demonstration, not stated as mandatory. |
| 20 — Acceptance | This is a derived implementation checklist, not the employer's final contract. Reclassify optional features using the original brief and track only the accepted scope as required. |

## 5. Scope established by the original brief

**Required end-to-end core:** ordering web app with menu and cart, test payment, central menu admin, and an outlet kitchen display with real-time order updates, in approximately six to eight screens. Include a working prep-time estimate, frontend, backend, database, sign-in, and customer/kitchen access separation.

**Core quality and automation behavior:** realistic sample data; correct outlet routing; mocked outside systems and transactional messages; outlet stock pausing; prep-time minimum, ten-minute late alerts, and manager override behavior; server validation and access control; tests for important logic; usable mobile layouts and loading/empty/error states. Respect the stated food-label, inclusive-GST, privacy, and marketing opt-in constraints. The estimator's safeguards are part of making the required automation work when wrong.

**Recommended supporting choices, labelled as assumptions:** protect the central CMS with an admin permission; provide a restricted manager permission for overrides and alerts; include customer tracking and a simple location/serviceability flow to demonstrate the whole order journey. Separate admin/manager role names and extra screens are implementation choices, not extra roles explicitly mandated by the core paragraph. Photos, portions, and add-ons make the ordering demo stronger, but their exact implementation depth should fit the core schedule.

**Optional depth after the core works well:** coupons, loyalty, dashboard, party ordering, reorder suggestions, city-specific prices, and time-based menus. We can pursue these incrementally for a stronger submission, but their omission does not invalidate the defined core. If omitted, remove related controls and explain the cut in the TDD. The reorder safeguard—never automatically adding suggestions—applies if suggestions are implemented.

**Submission requirements:** public GitHub repository through review, preserved commit history, and one ZIP up to 25 MB containing the TDD and `deployment.md`. Deployment is recommended for a convenient reviewer experience; the original asks for a live URL if deployed.

**Assessment priorities:** quality 50%, problem solving 30%, communication 20%. The client's statement that design counts as much as features reinforces UI quality; it is not a separate numerical scoring allocation. Understanding and explaining the implementation supports the communication and interview requirements.

## 6. Corrections and decisions needed before implementing the affected features

### 6.1 Resolve conflicting definitions of required scope

The original brief resolves the derived document's loyalty/coupon conflict: the remaining MUST HAVE features are optional depth beyond the core. The original requires a manager override behavior but does not mandate a separate `manager` role name or a large manager dashboard.

**Recommendation:** use a required-core checklist plus an optional-enhancement checklist. Implement the smallest authorized manager workflow needed for the estimator safeguards and document its access model as an assumption. Do not let the derived checklist silently expand required scope.

### 6.2 Describe the prep-time algorithm honestly

The formula has configurable weights but no learned model, training process, or evaluation data. It is a **rules-based prep-time estimator**. Calling it a trained AI predictor would misrepresent the implementation.

The original specifically asks for an AI prep-time estimate and, in the general assessment, working "AI or automation." It does not mandate an LLM, a vendor API, a trained model, or a training dataset. That gives implementation flexibility but does not establish that every estimator will be viewed equally by reviewers.

**[PROPOSED ASSUMPTION]** Begin with a real, load-aware rules-based estimator, accurately identified as such, using order quantities, item preparation times, and current kitchen work. Show that busier kitchens change its output, enforce the outlet minimum, handle missing/invalid configuration conservatively, support logged manager overrides, and test late alerts. Document the choice and its limitations in the TDD. Do not label a constant, random number, or rules formula as a trained AI model. A genuinely learned estimator can be considered as additional depth with disclosed data provenance and honest evaluation; synthetic-data performance would not prove real kitchen accuracy.

### 6.3 Define estimates, minimums, delivery time, and overrides precisely

The original requires the higher of the estimate and the outlet minimum, plus manager override capability. Five-minute rounding, a delivery buffer, and an override allowed below the minimum come from the derived proposal, not the original.

**[PROPOSED RULE]** Initially use one clearly labelled preparation/ready-by promise: `promised_minutes = max(estimate_minutes, outlet.min_prep_minutes)`. Normalize estimator output to whole minutes before applying the rule. An authorized override replaces the estimate while preserving the outlet minimum; log actor, reason, old promise, and new promise. This resolves the override ambiguity conservatively and must be labelled as an assumption.

For example, estimate 22 minutes and minimum 25 gives a 25-minute preparation promise. Estimate 37 and minimum 25 gives 37 minutes. A separate delivery estimate can be added later with a labelled buffer assumption, but it must not be presented as tracked rider arrival or replace the preparation promise without explaining that change.

Define kitchen load in terms of remaining work for PLACED and PREPARING orders. Exclude unpaid, ready, handed-off, cancelled, and completed orders. Otherwise food already ready for collection incorrectly makes the kitchen look busy. Initial remaining-work approximations must be documented as assumptions.

### 6.4 Make lateness meaningful and repeat-safe

`now > promised_at` alone would make historical completed orders appear increasingly late forever. A ten-minute alert also needs a process that runs without someone viewing the screen.

**[PROPOSED RULE]** Apply kitchen late alerts to orders still waiting to become ready, against their kitchen-ready promise. Record final delay when preparation completes. Keep the original promise for performance analysis, retain override history, and distinguish the current customer promise from the original. Use a background worker and a database uniqueness rule to send the specified ten-minute alert once per order. Further delay updates, if added, need their own explicit policy.

### 6.5 Extend idempotency to checkout and payment retries

The file makes the payment-attempt key unique but does not fully specify how two simultaneous checkout requests reuse one order.

**[PROPOSED RULE]** A stable checkout key scoped to the customer identifies one logical checkout. Reusing it with the same cart returns the same result; reusing it with a different cart is rejected. A retry can create another payment attempt under the same eligible order. Lock or atomically update the affected records during callbacks. Repeated callbacks, concurrent callbacks, and delayed failures must not duplicate rewards or overwrite a settled success.

Verify the HMAC against the raw request bytes before trusting the callback body. Also check the payment attempt, amount, currency, and allowed transition; a valid signature alone is not the entire validation.

### 6.6 Add explicit refund and payment-reconciliation behavior

If payment succeeds after an item becomes unavailable, the file says to flag a refund/cancel but supplies no complete state or record for it. The same issue occurs if success arrives after expiry, or if a paid order is cancelled.

**[PROPOSED RULE]** Track payment status separately from kitchen/order status and record a mock refund or reconciliation state. A paid order that fails final fulfillment checks must not reach the kitchen as a normal placed order. Late success after expiry must follow the reconciliation rule instead of silently resurrecting the order. Show the customer what happened and audit the financial result. No real money moves in this project.

### 6.7 If optional loyalty/coupons are added, define reservations without double counting

The suggested ledger mixes earned, redeemed, reserved, and released points without fully defining their signs and effects. For example, recording both a reservation and redemption as independent debits could deduct points twice.

**[PROPOSED RULE]** Distinguish posted balance from active reservations. Available points equal posted balance minus active reservations. On success, release the hold and post redemption exactly once; on failure, release the hold without a debit. Apply the same transactional care to coupon limits. Record a checkout expiry time so abandoned holds can be released.

Cancellation after payment also needs a policy for reversing rewards and restoring redeemed points. If earned points are spendable immediately and later spent, reversing them can conflict with the non-negative balance rule. Decide a policy before implementing loyalty; one option is to make earned points available after the cancellation window closes. That option changes the specification's immediate-award behavior and must be labelled, not silently introduced.

### 6.8 Complete pricing and routing definitions

Use integer paise and explicit rounding. Define whether coupon eligibility is checked before loyalty, the order of deductions, delivery fees, and exactly which amount is taxable. The sample orders have zero delivery fee; this does not specify all future deliveries.

**[PROPOSED DEMO RULE]** Zero delivery fee for the initial slice, coupons applied to eligible food subtotal before loyalty, and loyalty treated as a discount for this demo. Calculate the inclusive 5% GST portion of the resulting taxable food amount once using integer rounding. Document this as a modeling assumption, not a general tax ruling about loyalty programs or delivery services.

Check serviceability against the actual delivery location at checkout. If the customer changes outlet, require an explicit cart reset or revalidation with clear feedback. Do not silently move a paid order to another outlet. Use Asia/Kolkata for outlet opening hours and display; store timestamps consistently, normally in UTC. Define cross-midnight hours and manually paused outlets.

### 6.9 Resolve kitchen undo and status-machine conflicts

The derived specification asks for undo, but its proposed state machine permits only forward preparation stages. **The original brief does not require undo.** A cosmetic undo button would be misleading.

**Recommendation:** define which corrections are allowed, by whom, for how long, and with what audit entry before exposing undo. Handoff should have stricter rules than starting preparation. DELIVERED is optional and requires an explicit mock event or actor because there is no rider integration. Do not imply that handoff proves delivery.

### 6.10 Complete the data model and deployment details

Add the fields needed by implemented behavior: delivery-address and coordinate snapshots, customer notes, session records, checkout expiry, confirmation/payment times, override history, refund records, and worker progress or durable job state. Preserve item names, selected options, prices, and applicable tax details on order lines so editing the menu does not alter an old receipt.

Menu image upload needs persistent storage; a temporary filesystem that disappears on deployment is insufficient. Decide between a persistent disk for the single-instance demo or object storage. Restrict formats and sizes and serve images safely.

SSE needs authentication and object/outlet authorization, a heartbeat, cleanup on disconnect, and recovery by fetching current state. Cookie-authenticated mutation routes also need CSRF protection or appropriate same-origin checks; httpOnly cookies alone do not provide this. UI route hiding is not access control.

### 6.11 Make demo data and success metrics reproducible

The sample clock times cannot all remain literal while also guaranteeing correct live states on every demo day. Keep the exact sample IDs, item quantities, totals, and intended states. Generate dates and times relative to seed execution, and document that choice. A known relative timestamp does not stay fresh forever: provide an explicit demo reset/reseed procedure instead of silently changing real orders.

Define checkout start once per attempt and successful payment as its end. Exclude abandoned/failed attempts from the completed-checkout median and report them separately. Define the repeat-customer numerator, denominator, outlet attribution, and time window before implementing a dashboard. Do not claim business targets from a handful of seeded customers.

## 7. UI/UX direction and what each interaction must do

**[PROPOSED DESIGN DIRECTION]** A warm neutral background, dark readable text, one restrained food-inspired accent, consistent typography, and high-quality food photography. Use food names, portions, prices, and availability as the visual priorities. A custom product identity matters more than adding many animations.

| Experience | Design and interaction requirements |
|---|---|
| Customer menu | Visible selected outlet; categories and useful filters; appetizing responsive photos; clear price and food symbols; an accessible customization sheet for portions and add-ons. |
| Cart and checkout | Easy quantity editing; explicit totals and errors; a useful sticky cart/checkout action; preserve progress across sign-in and payment failure; make processing states prevent accidental duplicate actions. |
| Payment and tracking | Label the gateway as a demo; distinguish pending from failed; provide safe retries; show the promised time and explain delay or refund states honestly. |
| Kitchen | Large readable cards and touch targets; timers; text/icon labels in addition to status colors; minimal motion; visible connection state; an optional chime that respects browser audio restrictions. |
| Admin | Searchable menu list, clear edit forms, validation near fields, saving feedback, and understandable per-outlet availability controls. |

**[PROPOSED MOTION]** Short transitions around 150–220 ms for sheets, buttons, and small state changes, adjusted after device testing. Prefer opacity and transform transitions, respect reduced-motion preferences, and prevent layout jumps. Animation must not delay adding food or paying. Avoid ornamental motion on the kitchen page.

Every visible interactive element needs a behavior, loading/disabled treatment where applicable, error handling, keyboard access, and an expected result. Decorative icons need no artificial click action; interactive icons need accessible names. Test touch and keyboard behavior, not only a screenshot.

## 8. Build checkpoints and your Git workflow

The checkpoints below are milestone boundaries, not rigid one-day assignments. Split a milestone into smaller updates if its explanation becomes too large to learn comfortably.

| Update | Working result | Main verification |
|---|---|---|
| 00 | Reviewed requirements and recorded proposed corrections | Source preserved; documentation checked; no application functionality claimed |
| 01 | Next.js/TypeScript setup, scripts, design tokens, accessible application shell | Install/build/lint/type checks as configured; responsive shell and focus behavior |
| 02 | PostgreSQL schema, migrations, and reproducible demo data | Clean migration and seed run; sample totals and relationships verified |
| 03 | Customer/staff/admin/manager authentication and permissions | Session lifecycle, invalid login, and unauthorized access tests |
| 04 | Outlet selection, menu, customization, and persistent cart | Serviceability, portions, add-ons, quantity controls, and stock states |
| 05 | Server pricing and GST | Paise arithmetic, rounding, and client-price tampering tests |
| 06 | Pending checkout and all mock payment outcomes | Idempotency, concurrent requests, retry, expiry, signatures, and reconciliation |
| 07 | Prep-time estimator, kitchen stages, and live events | Estimate rules; legal transitions; correct outlet delivery; reconnection and polling |
| 08 | Menu admin, stock updates, customer tracking, overrides, and late alerts | End-to-end propagation; ownership checks; one-time alerts; upload validation |
| 09 | Core review, consent checks, mock message visibility, and product polish | Browser/device interaction checks; empty/loading/error states; accessibility; opt-in behavior |
| 10 | Optional depth selected according to remaining time: coupons/loyalty, then other modules | Feature-specific tests, including reservation/concurrency rules if these features are added |
| 11 | Final submission documents and recommended deployed demo | Local/deployment smoke tests as applicable; demo accounts; complete core flow; ZIP contents and size |

Tests, security, consent handling, and visual checks belong in every relevant update; they are not postponed until update 9 or 11. Optional loyalty/coupons must not delay a complete core payment flow. Add their reservation logic and tests when those features are selected. Keep time for submission documentation and validation even if optional modules are skipped.

Each update ends with a list of files changed, a separate explanation, actual checks performed, any remaining limitations, and a suggested commit message. **You review, commit, and push.** We do not accumulate unrelated later milestones while waiting for your checkpoint.

## 9. What every future code explanation will include

1. Purpose: which requirement the file implements and why the file exists.
2. Prerequisites: concepts to know before reading it.
3. File connections: imports, exports, callers, API endpoints, database records, and related tests.
4. Line-by-line explanation of the meaningful source, including syntax when introduced for the first time.
5. Execution flow: what starts it, what happens next, where asynchronous work pauses, and what the user sees.
6. Design decisions: alternatives considered, why this approach fits, and tradeoffs.
7. What-if cases: removing validation, changing a value, losing a connection, sending duplicate requests, and other relevant failure modes.
8. Verification: how to run the relevant checks, expected outcomes, actual results, and debugging guidance.
9. Interview questions, concise answers, follow-ups, and examples tied to the implementation.
10. Quick revision summary at the very end, sufficient to refresh the key ideas without rereading everything.

Explanations will be separate Markdown files. Handwritten configuration and tests also need explanations. Generated artifacts and lockfiles will be identified and explained by purpose and how to regenerate them; their machine-generated lines are not handwritten logic. Later edits will update the affected explanation so line references and behavior remain accurate.

## 10. Interview questions and reasoning

**Q: What is the main business problem?**

A: The restaurant depends on marketplaces for sales and customer access. Direct ordering reduces commission exposure and gives the restaurant a controlled menu and a direct customer relationship. The core demo proves the order-to-kitchen workflow.

**Q: Why Next.js rather than separate frontend and backend projects?**

A: The initial product has one browser application and a small team. One codebase reduces deployment and integration overhead. Server logic remains organized separately from UI code so a later API split is possible if justified.

**Q: Why PostgreSQL?**

A: One successful checkout affects related orders, payment attempts, coupon usage, and possibly loyalty balances. Transactions and constraints help those changes succeed together and protect against concurrent requests.

**Q: Why doesn't TypeScript replace Zod?**

A: TypeScript checks code during development. HTTP requests arrive at runtime and can contain arbitrary values. Zod validates their actual shape; business rules then check whether those values are acceptable.

**Q: Why calculate prices on the server? What if the frontend already calculated them?**

A: The frontend is under the customer's control and may also be stale. The server reads trusted prices and rules, validates availability, and computes the payable amount. A request with a tampered total cannot purchase an item cheaply.

**Q: Why store money as paise?**

A: Integer units avoid binary floating-point surprises in financial calculations. Percentage calculations still need a defined rounding policy. Inclusive GST is the tax portion inside the price, not another 5% added to it.

**Q: What is idempotency?**

A: Repeating the same logical operation has the same business effect as processing it once. A duplicate success callback must not issue another order, reward, or notification. Database constraints and transactional state checks must enforce this even when callbacks arrive simultaneously.

**Q: Are checkout idempotency and webhook idempotency the same?**

A: They guard different boundaries. Checkout idempotency prevents duplicate pending orders from repeated purchase requests. Webhook idempotency prevents repeated gateway messages from applying the payment result more than once.

**Q: Why SSE instead of WebSockets?**

A: The live requirement is mostly server-to-browser updates. Staff actions can use ordinary authenticated HTTP requests. SSE provides a simpler streaming path, while polling and state refetching cover interruptions. Event transport does not replace the database.

**Q: What happens when an event is missed or the server restarts?**

A: The committed order still exists in PostgreSQL. The reconnecting client fetches current state and resumes live updates. Polling limits how long the screen stays stale. A transient in-process event cannot be treated as the only record of the order.

**Q: Why authorize SSE if the page already requires login?**

A: A user can call the stream endpoint directly or change an outlet identifier. The server must bind the stream to the authenticated user's allowed outlet or order. A protected page does not secure a separate endpoint automatically.

**Q: Is the prep estimator actually machine learning?**

A: The formula in the derived specification is deterministic and rules-based. The original brief does not prescribe a model or provider. The proposed baseline actually responds to kitchen load and includes minimum-time and manager safeguards, but it must be described honestly as rules-based. A learned predictor would require data, evaluation, and monitoring; using AI to help write the application is separate from implementing its prep-time feature.

**Q: Why keep order status and payment status separate?**

A: Payment success describes money handling; kitchen status describes fulfillment. Payment can succeed even when fulfillment must be cancelled and refunded. A single ambiguous status makes those cases hard to represent correctly.

**Q: What happens if an item goes out of stock while someone is paying?**

A: Revalidate when processing success. If fulfillment cannot proceed, record the paid-but-unfulfillable outcome, start the defined mock refund/reconciliation flow, inform the customer, and avoid sending it to the kitchen as a normal order.

**Q: Why use a worker for alerts and expiry?**

A: Time passes even if every browser is closed. A worker checks durable state and applies expiry or alerts safely. A browser timer or request-local timeout can disappear on navigation or process restart.

**Q: Does reserving loyalty points mean spending them?**

A: A reservation temporarily removes points from the available balance. Successful payment converts the hold into a posted redemption; failure releases it. Without a clear distinction, a system can spend points twice or prevent valid retries.

**Q: How do you prevent one kitchen reading another kitchen's orders?**

A: Derive scope from the authenticated staff record and include it in server queries and mutations. Apply the same scope to streaming. Test direct requests for another outlet, rather than testing only hidden navigation links.

**Q: How does the design serve the different users?**

A: Customers need clear food choices and low-friction checkout. Kitchen staff need large, high-contrast information and immediate actions. Admins need efficient editing and useful validation. Consistent tokens connect those experiences without forcing the same layout onto them.

**Q: What would you cut first if time runs out?**

A: Optional analytics, party ordering, scheduled menus, city pricing, and reorder suggestions; coupons and loyalty are also optional under the original core-build rule. Preserve the complete paid-order flow, payment correctness, prep-time safeguards, live kitchen updates, permission checks, tests, and understandable error states. Record cuts honestly in the TDD.

## 11. Review verification and commit checkpoint

This update reviews the original brief and the derived specification; it does not establish that any application feature works. The workspace had an initialized Git repository with no commits and no application files when inspected. No application tests apply yet. Documentation/source-copy checks are reported with the update. The earlier required-loyalty recommendation has been corrected rather than carried into the implementation plan.

Suggested commit message: `docs: review project requirements and implementation decisions`

Commands for you to run from the project directory after reviewing these files:

```sh
git add CLIENT_BRIEF.md PROJECT_SPEC.md docs/explanations/00-requirements-review.md docs/explanations/00-tech-stack.md
git diff --cached
git commit -m "docs: review project requirements and implementation decisions"
```

No remote URL was supplied in this conversation. GitHub push instructions will use your actual configured repository rather than an invented URL. This remains the same documentation checkpoint; receiving the original brief has refined it before the first commit. The assessment opening timestamp is still needed to identify the exact deadline.

## 12. Quick revision summary

- **Purpose:** Build direct restaurant ordering connected to a central menu and the correct kitchen, with a polished customer experience.
- **Main flow:** Location → menu → customized cart → server-priced checkout → mock payment → correct kitchen → live customer updates.
- **Stack:** TypeScript, Next.js route handlers, Tailwind/shadcn, PostgreSQL, Prisma, Zod, cookie sessions, SSE plus polling, a small worker, Vitest, and Playwright.
- **Source of truth:** `CLIENT_BRIEF.md` records the original employer brief. The unchanged `PROJECT_SPEC.md` is a derived proposal containing extra assumptions.
- **Required scope:** Menu/cart, test payment, central menu admin, live outlet kitchen display, sign-in/access control, working prep-time estimation and safeguards, realistic data, polished states, important tests, and basic security.
- **Optional scope:** Coupons, loyalty, dashboard, party orders, reorder suggestions, city pricing, and scheduled menus. The earlier statement making loyalty/coupons mandatory was incorrect.
- **Estimator:** No model/provider is prescribed. A real load-aware rules-based baseline is a proposed assumption, not a trained AI model; describe it honestly and test its fallback/minimum, override, and late-alert behavior.
- **Other decisions:** Define the promise consistently, payment/refund/expiry behavior, permissions, and missing data fields. Loyalty accounting and kitchen undo matter only if those optional features are included.
- **Payment safety:** Trust server prices; use integer paise; make checkout and callbacks idempotent; transact shared changes; handle retries and late callbacks.
- **Live correctness:** PostgreSQL is authoritative. Authorize each stream and action, refetch after disconnect, and use polling as fallback.
- **Design:** Food-first mobile UI, clear checkout, restrained short transitions, reduced-motion support, and a highly readable low-motion kitchen screen.
- **Testing:** Verify calculations, concurrent payment behavior, role/outlet isolation, stock changes, real-time recovery, and every visible interactive control.
- **Learning and Git:** Separate explanations cover each file, its connections, execution, alternatives, failures, tests, and interviews; each ends in a summary. You make each commit and push.
- **Submission:** The original brief confirms a ZIP up to 25 MB with exactly the TDD and `deployment.md`; put the public GitHub URL at the top of the TDD, include a live link if deployed, and document assumptions, cuts, and limits.
- **Time and scoring:** Seven days from assessment opening, individual work with AI assistance encouraged; quality 50%, problem solving 30%, communication 20%. The client's eight-week budget context is separate.
- **Current status:** Requirements review only. No application implementation or application tests have been completed yet.
