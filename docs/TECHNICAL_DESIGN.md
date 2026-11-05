# Deccan Kitchen & Co.
## Technical design document

GitHub: https://github.com/DhanushYarragunta/direct-order-platform

Quality revision | 5 November 2026 | Company A, Hyderabad

Live app: not deployed. Run locally at http://127.0.0.1:3000 using deployment.md. The public repository and prior feature commit were checked on 4 November; quality fixes are committed locally after checks; remote publishing is separate.

### Product and scope
Company A wants to own its direct ordering channel, control its menu centrally and send orders to the right kitchen. The original CLIENT_BRIEF.md is the requirements authority. The client estimates an annual benefit of about INR 1.14 crore; this is a business-case assumption, not a measured result of this build.

The implemented core covers browsing, portions and add-ons, location-based outlet selection, a persistent cart, test UPI/card payment, live tracking, menu administration and outlet kitchen tickets. This candidate also includes coupons, loyalty, party requests, city price overrides, scheduled menus, reorder suggestions and outlet reporting.

### Architecture and why
One Next.js 16 App Router application serves customers, kitchen staff, managers and central administrators. TypeScript spans UI and domain logic. PostgreSQL with Prisma 7 provides shared state and transactional guarantees. Separate HTTP handlers, domain modules and UI components keep changes reviewable without introducing several services.

<!-- architecture -->

React screens use ordinary authenticated JSON requests for mutations. Server-sent events announce changed data; clients fetch authoritative state. A shared poller per audience/outlet in each Node process checks revisions every three seconds; session revalidation is batched. Clients show live/reconnecting/offline, abort hung fetches and replace stale streams, with fallback refresh while unhealthy. The three-second job loop handles delayed payment settlement, expiry and late alerts from durable database timestamps. A long-running Node host is required.

<!-- page -->
# Data and main flows

### Data model
- User, PhoneOtp and Session: role, optional phone, deletion marker, expiring hashed demo challenges, optional staff outlet, consent, scrypt password hash, hashed opaque session token and expiry. Registration always creates a customer.
- Outlet, MenuItem, MenuCityPrice, Availability and AddOn: shared catalogue, city overrides, India-time serving windows and separate per-outlet stock state.
- Order and OrderLine: immutable price/name/option snapshots, fulfilment details, delivery fee, checkout start/duration/source, delivered time, totals, coupon and points snapshots, payment-confirmed time, preparation promise and version.
- Payment: unique attempts, simulated outcome and durable delayed-settlement deadline. Message and Audit record customer updates and operational actions.
- Coupon and LoyaltyEntry: configured offer rules and an append-only points ledger. Order plus ledger kind is unique, preventing duplicate debit, release or earnings.
- CateringRequest: owner, outlet, event, party requirements, manager response, version and unique client retry key. RateLimit stores bounded login attempts.

### Customer checkout to kitchen
1. The selected outlet's effective menu includes city prices and serving-hour availability. The user explicitly chooses a dish, portion and extras.
2. The quote endpoint resolves the nearest open eligible delivery outlet from coordinates or a confirmed curated locality/pincode, then calculates discounts, points, delivery fee and GST from current database prices. It also shows a kitchen-load preparation estimate before payment. No client-supplied price is accepted.
3. Checkout repeats authoritative delivery routing, validates radius, delivery minimum and stock, locks the customer and outlet, and stores order/line snapshots plus any points debit in one serializable transaction.
4. A unique customer/checkout key and canonical payload hash allow safe retries. Reusing a key for a changed cart is rejected.
5. The test gateway simulates success, failure or an eight-second delayed result. A successful settlement rechecks availability, schedule and first-order coupon eligibility. A failed recheck refunds the simulated payment and restores points.
6. Paid orders become PLACED, PREPARING, READY and HANDED_OFF. Delivery orders continue to OUT_FOR_DELIVERY and DELIVERED; pickup completes at handoff. Version checks reject stale kitchen actions. Customers may cancel while PLACED; payment and points are reversed together.

### Money and concurrency
All prices are integer paise. Displayed prices include 5% GST; the included tax is round(total x 5 / 105). Discounts apply before tax. Fifteen-minute unpaid expiry releases reserved rewards; failed attempts can retry until then. Row locks, unique constraints and four-attempt serialization/deadlock retries protect concurrent work, including direct PostgreSQL adapter errors at COMMIT. Connection failures are not blindly retried.

<!-- page -->
# Automation and extended workflows

### Preparation estimates and recovery
The estimator is a transparent rules-based baseline, not a trained AI model. Suggested minutes = ceil(10 + new order work / 2 + queued work / active stations). Work includes dish preparation, quantity, family portions and extras. The promise is the higher of the suggestion and the outlet minimum.

Invalid numeric inputs fall back to the configured minimum, or 30 minutes when that minimum is invalid. The estimate and fallback flag are stored. Managers can override an active promise, respecting the outlet minimum, with a required reason and audit entry. At ten minutes past the current promise, the job loop creates a deduplicated manager alert and simulated customer message. No external AI service can block checkout.

### Coupons and direct-order rewards
Demo policy assumptions: WELCOME100 gives INR 100 off a first paid order with an item subtotal of at least INR 499. BIRYANI10 gives 10% off a subtotal of at least INR 399, capped at INR 150. One point equals INR 1; redemption is capped at 20% of the amount after the coupon. Completed fulfilment earns one point per full INR 100 actually paid.

The user row serializes balance changes across outlets. Pending welcome-code checkouts reserve eligibility; settlement checks again if another order was paid. A checkout debits reserved points; cancellation, expiry or stock refund releases them exactly once. Earnings occur exactly once at pickup handoff or delivery completion. The wallet shows the balance and recent ledger entries.

### Menu rules and suggestions
An outlet's city selects an optional price override; absent overrides use base prices, and absent family overrides inherit the base family price. Prices on existing orders stay unchanged. Schedules use Asia/Kolkata and selected start weekdays; overnight windows belong to their starting day. Public availability combines publication, kitchen open state, serving hours and stock. Staff toggle stock independently of time-based availability.

Suggestions rank the customer's purchased items from the latest 50 paid orders at the selected outlet, excluding unavailable dishes. They open customization only after an explicit click and never add anything automatically.

### Party orders
Assumptions: 10-500 guests, at least 24 hours' notice, at most 180 days ahead. A request collects venue, menu, dietary requirements, contact and optional budget. A scoped manager or admin confirms or declines with a note; the customer sees the response and can cancel while awaiting it. Submission retries are idempotent. Catering creates no automatic quote, payment or kitchen ticket.

<!-- page -->
# Customer experience and design

### Food first, short path to checkout
The concept brand uses a charcoal navigation rail, warm amber actions, light surfaces and generous spacing. Seven photographed dishes include the four supplied images and three credited CC BY-SA demo photographs. Source marks are retained; image rights are not implied. Category/search and vegetarian filters keep the menu easy to scan. Every dish exposes diet, spice and allergen details.

<!-- snapshot:menu-desktop.png -->

The cart persists IDs/options/quantities rather than trusted prices. Payment consumes its recorded cart generation once, preserving later additions or replacements. A browser Web Lock serializes payment tabs; unsupported browsers keep the cart with a review reminder. Outlet changes load a fresh menu. Checkout asks for phone/fulfilment, plus address/location for delivery. Coupons, loyalty and server totals share the summary; menu failures offer retry.

### Supporting screens
Payment explicitly identifies itself as a simulation. Tracking combines stages, current promise, a receipt and simulated messages. Order history includes rewards activity. Party requests have their own form and manager-response cards. Error messages include retry actions; empty states explain the next step. Sign-in exposes labelled demo roles only when demo mode is enabled.

### Responsive and accessible choices
Customer layouts collapse to one column on phones. Menus use named buttons, food text accompanies diet symbols, and statuses use words as well as colour. Radix dialogs manage focus; keyboard focus and reduced-motion styles are present. Kitchen ticket IDs are 30px, timers 26px, item names 24px, modifiers 18px and notes 20px. Green, amber and red bands have explicit status labels. Sound and wake lock are user-enabled; a manifest supports home-screen installation. Mobile allergens are at least 14px and the promotional hero is hidden to bring dishes higher. Browser overflow checks and screenshots cover narrow screens; physical two-metre readability still needs a real kitchen-tablet evaluation.

<!-- page -->
# Operations and reporting

### Kitchen and central control
Each kitchen account is tied to one outlet. Its display separates received, preparing and ready tickets, highlights overdue work and supports handoff. Active tickets are never displaced by the separate 100-row recent history cap. Managers can revise promises with an explanation. Central administrators edit dishes, library/uploaded photos, prices, city overrides, serving windows, outlet availability, delivery policies and licence declarations. Uploads are admin-only, limited to 3 MB and 16 megapixels, decoded from JPEG/PNG/WebP, stripped of metadata and re-encoded as WebP on durable storage.

<!-- snapshot:kitchen-desktop.png -->

### Reports with explicit definitions
The overview queries all matching database rows, with no 100-order source cap. Admins select an outlet or all kitchens; staff are restricted to their assigned outlet. Rolling 24-hour, 7-day and 30-day periods cover orders, net paid sales, average preparation, refunded cancellations and repeat customers. Daily activity uses India Standard Time.

Repeat customers means at least two paid orders in the selected period. Outlet rows count visits to that outlet; the combined metric deduplicates customers across outlets. A separate Business targets section uses first-paid-order monthly cohorts, a full 30-day eligibility window, and returns within 30 days. Recent cohorts show pending customers. Unpaid/expired checkouts are distinguished from refunded cancellations. Preparation runs from successful payment to READY; historical sample orders use their original placed time as the best available approximation.

Checkout duration is captured from first visible cart (direct checkout entry fallback) to successful payment, with client-start limits and server settlement time; demo and live browser sources are separated. Absent/invalid timings are excluded from medians. Dated aggregate app-order baselines produce direct/app-order ratios for exactly matching outlet/period intervals; overlapping baselines are rejected and changes audited. Neither feature alone proves the business targets.

### Delivery and operating model
The system routes orders by location/delivery radius but does not dispatch real riders. Handoff is a kitchen stage; staff manually record dispatch and confirmed delivery. It does not replace billing or inventory, and has no delivery-app integration. Payments and WhatsApp/SMS messages are simulated, as permitted by the brief. Party confirmation is human-operated and remains separate from live kitchen tickets.

<!-- page -->
# Verification and next steps

### Reproducible verification
Verified on 5 November 2026: TypeScript, 79 domain tests, 41 PostgreSQL integration tests, 23 browser scenarios and the production build passed. Reproduce with npm run verify:core. Temporary databases are dropped; the demo is preserved. Compact current evidence is in .local/quality-verification.json and the retained sustained-load JSON. Verification commands regenerate detailed logs and screenshots after cleanup.

Coverage targets pricing/GST, validation, passwords, routing, estimates, schedules, coupons and catering. Database tests cover concurrency (including a real COMMIT conflict), refunds, rewards, expiry, alerts, access and reports, including 105 active tickets amid 105 newer terminal orders. Browser checks cover the main flows, cart edit history, simultaneous payment tabs and recovery.

### Current sustained local rehearsal
On 5 November, the updated production build completed 100/100 paid orders over a 300-second arrival window at 1,200/hour with 45 streams and no failures or dropped arrivals. Workflow p95 was 38.30 ms; SSE-triggered kitchen API visibility p95 was 146.54 ms (maximum 2.99s). This is local API visibility, not tablet paint, WAN performance or a production guarantee. See PERFORMANCE.md.

### Historical local performance sample
The opt-in local test completed 30/30 orders over 90 seconds (1,200/hour offered rate), with zero errors across 90 measured requests and three live kitchens. API workflow p95 was 201.7 ms; kitchen visibility p95 was 2.84 s. Five automated mobile flows had a 0.32 s median, excluding human input time. This does not establish sustained production capacity or human checkout speed. See docs/PERFORMANCE.md; run npm run test:performance.

### Security and personal data
Nonce-based CSP restricts scripts; HSTS is emitted only for the configured HTTPS origin. The privacy page supports marketing withdrawal, authenticated export and transactional customer anonymization with session revocation. Accounting history is de-identified; backup expiry and legal retention require operator policy. Active orders block deletion until resolved; staff accounts cannot self-delete.

Random session tokens are cookie-held and hashed at rest. Cookies are HttpOnly, SameSite=Lax and Secure on HTTPS. Mutations check origin, bounded JSON, strict schemas and authorization. Passwords use salted scrypt. Marketing opt-in is unticked; demo messages are transactional. Secrets, local databases, builds and reports are ignored by Git.

### Assumptions to review
The brand, outlet coordinates/addresses, five-kilometre radius, menu prices, preparation work/capacity, reward and coupon policies, catering limits and additional historical records are invented implementation assumptions. The three original sample order IDs, totals and states are preserved. Three outlets and seven photographed active dishes form the demo catalogue. All seeded outlets are in Hyderabad; city pricing is implemented but other-city expansion is not asserted.

FSSAI values are fourteen-digit, zero-prefixed demo identifiers, explicitly not licences. Admins can enter real numbers with an attestation note; zero-prefixed values cannot be verified. The system does not claim regulator verification. Sample accounts use fake .example email addresses. Email/password and explicitly simulated phone OTP are available; non-demo phone login fails closed without a real provider. The estimator is a baseline whose accuracy needs real operational data. Current sample data and demo shortcuts are unsuitable for production.

### Limits and next steps
Remaining production work: chosen hosting account/domain and deployment, verified licences/photo rights/contact/retention decisions, calibrated estimates, physical tablet evaluation, sustained staging tests and human checkout studies. Mock providers meet the assessment scope. No adoption, repeat-customer or sub-60-second human checkout target is claimed. Coupons are seeded; photo uploads are supported. Generated PDFs/ZIPs and duplicate previews/photos are excluded from Git. Source packaging archives only committed files. See LAUNCH_OPERATIONS.md and ACCEPTANCE_TESTING.md.

### Deployment artifacts
Docker/Compose defines web, worker and PostgreSQL, persistent uploads and health checks; GitHub Actions verifies TypeScript, tests, build and image build. The Linux ARM64 Docker image build passed locally; the deployed service/database runtime and public host are not yet verified. The long-running worker uses durable database timestamps; the recovery runbook includes database/upload backups and a restore drill.
