# PROJECT SPEC: Direct Ordering Platform for Company A (Hyderabad biryani chain)

> Implementation checkpoint: this document preserves the broader proposal. See `docs/TECHNICAL_DESIGN.md`, `docs/REVIEW_GUIDE.md` and `README.md` for the completed local candidate, explicit differences, and production limits. `CLIENT_BRIEF.md` remains the source of truth.

> Hand this whole file to the coding agent (Claude Code / Codex). Place it in the repo root as `PROJECT_SPEC.md`.
> Items marked **[ASSUMPTION]** are not stated in the client brief. They must be listed in the Technical Design Document (TDD) under "Assumptions".

---

## 0. Instructions to the coding agent

You are building a working, end-to-end product for a real-looking client, as a solo 7-day take-home task. Follow these rules:

1. **Build a small part really well instead of the whole scope badly.** Finish the CORE BUILD (section 5) first, fully working, before touching optional depth (section 6).
2. **No dead buttons.** Every visible control works or is not shown.
3. **Seed realistic sample data** so the app never looks empty (section 12).
4. **Commit often with clear messages.** The reviewers read the commit history. Use small, meaningful commits (for example `feat(orders): add order state machine`, `test(payments): idempotent callback`).
5. **Never commit secrets or real personal data.** Use `.env.example` with variable names only. Use fake names, fake phone numbers.
6. **Validate every input on the server** (Zod). Enforce access control on every route by role.
7. **Never trust client-sent prices or totals.** Recompute on the server.
8. Every screen needs **loading, empty and error states**, and must work on a phone.
9. Write **tests for the important logic** (section 13).
10. Keep the code clean and readable, with a clear folder structure and a short README.

---

## 1. The client

**Company A, Hyderabad.** Biryani and Hyderabadi food chain.
- 14 outlets and 3 cloud kitchens (cloud kitchens are delivery-only)
- 520 staff
- Revenue ₹90-105 crore a year, **55% through food delivery apps**
- The founder-CEO signs the deal

## 2. Today (the current situation)

- Delivery apps charge **25-30% commission and fees**.
- A phone line takes bulk and party orders.
- Each outlet's billing system is separate.
- Menus and prices are updated **by hand on every app**.
- **The brand owns no customer data.**
- Kitchens work from **printed tickets**.

## 3. The problem (the business case)

Assumptions given by the client:
- App sales = 55% of ₹96 crore = ₹52.8 crore at 27% average commission.
- Moving 12% of that to direct orders, where delivery and payment costs are 12%, saves 15 points on ₹6.336 crore = **₹95.04 lakh**.
- The phone line loses 30 bulk orders a month at ₹18,000 and 30% margin: 30 x ₹5,400 x 12 = **₹19.44 lakh**.
- **Total: about ₹1.14 crore a year.**

## 4. What the client asked for (in their words)

> "I pay the apps a quarter of every order and they own my customers. I want our own ordering site that is faster and nicer than the apps, with one menu and prices I control. Orders should go straight to the right outlet's kitchen screen. Regulars should earn rewards for ordering direct, and party orders should be easy to place."

### Users
- **Customers** (mobile)
- **Outlet managers and kitchen staff**
- **Central marketing team**
- The founder-CEO signs the deal.

### Roles to implement
- `customer`
- `kitchen_staff` (tied to exactly one outlet)
- `admin` (central marketing team: menu CMS) **[ASSUMPTION: the brief lists only customer and kitchen staff as roles for the core build; an admin role is needed for the central menu CMS]**
- Optional: `manager` (outlet manager: estimate override, late-order alerts) **[ASSUMPTION]**

---

## 5. CORE BUILD (must work end to end, about 6 to 8 screens)

Candidates must ship this slice end to end:

1. **Ordering web app** with menu and cart
2. **Test payment** (mock payments)
3. **Central menu admin**
4. **Outlet kitchen display**

- Roles: customer and kitchen staff.
- AI: **prep-time estimate**.
- **Hard part: real-time order updates on the kitchen screen.**
- Mock payments, messages and outside systems. Seed from the sample data.
- The rest of MUST HAVE is optional depth.

### Suggested screens (8)
1. Location / outlet picker (landing)
2. Menu (big photos, filters, add-ons and portions)
3. Cart and checkout (coupon, loyalty, UPI/card, under 60 seconds)
4. Mock payment page (success / fail / pending)
5. Live order status (customer)
6. Admin: menu list and item editor
7. Kitchen display (tablet)
8. Login (customer mobile + mock OTP, staff email + password)

---

## 6. MUST HAVE list (full client scope; items beyond the core are optional depth)

### 6.1 Ordering web app
- Outlet picked by **location and delivery radius**
- Menu with photos, **add-ons and portions** (for example family pack, half/full)
- Cart
- Coupons
- **UPI and card payment (test mode)**
- **Live order status**

### 6.2 Central menu CMS
- Items, **prices by city**, **outlet availability**, **time-based menus**, photos
- **Veg and non-veg marks**, **spice level**

### 6.3 Kitchen display per outlet
- New orders with **timers**
- **Prep stages**
- **Ready for pickup**
- **Rider handoff**

### 6.4 Loyalty
- Points on **direct orders**, **redeemed at checkout**

### 6.5 Party order form
- **Minimum notice**, and **confirmation by the catering manager**

### 6.6 Dashboard
- Orders, prep time, cancellations and repeat customers **by outlet**

**Priority:** Core build first (6.1 basics, 6.2 basics, 6.3, payments). Then loyalty, then dashboard, then party orders, then time-based menus / city pricing.

---

## 7. Out of scope (do not build)

- Delivery app integration
- An own rider app (riders come from a delivery partner; only build a "rider handoff" status)
- Replacing outlet billing or inventory

---

## 8. AI and automation

Client expectations:
- Orders **route to the right outlet automatically**.
- **Status updates go out by WhatsApp or SMS** (mock this: store messages in a table and show a "Messages sent" log).
- **Items pause when an outlet marks them out of stock.**
- AI **suggests reorders** from each customer's history (optional).
- AI **predicts prep time from current kitchen load**, so the promised time is honest. **(Required in the core build.)**

### When the AI is wrong (mandatory rules)
1. **Suggestions never add items to the cart.** (Reorder suggestions are shown; the customer adds them.)
2. **The promised time is the higher of the AI estimate and the outlet's minimum.**
3. **An order 10 minutes past its promise alerts the outlet manager and updates the customer.**
4. **Managers can override estimates.**

### Prep-time estimate design **[ASSUMPTION: transparent formula, no LLM, so it is testable and cannot fail due to an external API]**

```
open_load_minutes = sum over open orders at the outlet
                    (items_in_order x item.prep_minutes)  / active_stations
new_order_minutes = sum(item.prep_minutes x qty) for this order
estimate          = base_minutes + new_order_minutes + open_load_minutes x load_factor
promised_minutes  = ceil5( max(estimate, outlet.min_prep_minutes) ) + delivery_buffer
promised_at       = placed_at + promised_minutes
```
- `item.prep_minutes`, `active_stations`, `base_minutes`, `load_factor`, `delivery_buffer`, `min_prep_minutes` are configurable seed values. **[ASSUMPTION]**
- Store the estimate, the outlet minimum, and which one won, on the order (for transparency and the TDD).
- A manager override replaces the estimate (still never below... the manager's value is final and is logged with who and when). **[ASSUMPTION]**
- Unit test: busy kitchen raises the estimate; quiet kitchen falls back to the outlet minimum; override applies.

### Reorder suggestions (optional)
- Simple rule: the customer's most frequent / most recent items at the chosen outlet that are currently available. Shown as a "Order again" row. **Never auto-added.**

### Automatic routing and out-of-stock
- Outlet chosen from customer location + delivery radius (Haversine distance vs `outlet.delivery_radius_km`). If several outlets qualify, pick the nearest open one. **[ASSUMPTION]**
- Kitchen staff can mark an item **out of stock** at their outlet; it disappears (or shows "Unavailable") on the customer menu immediately and cannot be added to cart or ordered (re-check at order creation).

---

## 9. Constraints (compliance and environment)

- Show each **outlet's FSSAI licence number** (on outlet page / footer / checkout).
- Show **veg and non-veg symbols** (green square dot / red-brown square dot) and **allergens** on items.
- **Prices include 5% GST and must say so** ("Inclusive of 5% GST"). Compute GST portion as `total x 5 / 105`. **[ASSUMPTION: GST-inclusive display; tax shown as a line on the receipt]**
- **Customer data is personal data under the DPDP Act 2023:**
  - Consent checkbox at registration (what is collected and why).
  - **Marketing messages need opt-in**: separate, unticked-by-default checkbox; store it with a timestamp; never send marketing to anyone without it. Order status messages are transactional.
  - Collect only what is needed; allow viewing / deleting own data (optional depth). **[ASSUMPTION]**
- **Peak load:** Friday and Sunday dinner peaks reach **1,200 orders an hour across outlets** (about 20 per minute, roughly 0.33 per second overall). Design for it: indexed queries, per-outlet event channels, no N+1 queries, and (optional) a small load-test script.
- **Kitchens use cheap Android tablets in hot, noisy spaces.** Lightweight page, large touch targets, no heavy animation, optional audio chime for new orders, resilient reconnection (SSE with polling fallback).

---

## 10. Design (the client weights this as much as features)

The client values **good, minimal design**: clean layouts, white space, a restrained palette, clear type, **nothing on screen that lacks a purpose.**

- **Menu should make people hungry:** big food photos, a short scannable menu, easy-to-read prices.
- **Checkout in under a minute** (median under 60 seconds): few fields, saved details, one-tap pay, sensible defaults.
- **Kitchen screen readable from two metres:** very large type, high contrast, **colour marking late orders** (for example green on time, amber near promise, red late), timers visible.
- Mobile-first for customers; tablet-first (landscape) for kitchen; desktop for admin.
- Consistent design tokens (colours, spacing, type scale) defined once. One restrained palette. One typeface family.
- Loading, empty and error states on every screen.
- Accessibility: contrast, focus states, labels, tap targets 44px+.

---

## 11. Budget, time and success measures (for context in the TDD)

- Client budget: **₹9 lakh, 8 weeks** (our task is a 7-day solo slice).
- Success measures the product should be able to show:
  - Direct orders equal to **12% of app orders within 9 months**
  - **Median checkout under 60 seconds** (log checkout duration per order: from cart open to payment success)
  - **35% of direct customers ordering again within a month by month 6** (dashboard: repeat-customer rate)

---

## 12. Sample data (seed this exactly, then add more)

| Order ID | Outlet | Items | Total ₹ | Payment | Placed | Promised | Status |
|---|---|---|---|---|---|---|---|
| WEB-778120 | Kondapur | Chicken dum biryani family pack x1, Double ka meetha x2 | 1180 | UPI | 20:14 | 20:59 | Preparing |
| WEB-778131 | Gachibowli cloud kitchen | Veg biryani x2, Mirchi ka salan x1 | 640 | Card | 20:21 | 21:01 | Ready for pickup |
| WEB-778146 | Kukatpally | Mutton haleem x3 | 1050 | UPI | 20:26 | 21:16 | Late by 4 minutes |

Additional seed (create yourself) **[ASSUMPTION: invented values]**:
- **3 outlets minimum** (Kondapur, Kukatpally, Gachibowli cloud kitchen) with lat/lng, delivery radius, FSSAI number (fake, 14 digits), opening hours, minimum prep minutes. Optionally more.
- **About 20-25 menu items**: Hyderabadi chicken dum biryani (portions: regular / family pack), mutton biryani, veg biryani, mutton haleem, mirchi ka salan, double ka meetha, qubani ka meetha, chicken 65, apollo fish, raita, drinks. Each with: veg/non-veg, spice level (1-3), allergens, prep minutes, photo, add-ons.
- Prices chosen so sample totals match (all GST-inclusive, zero delivery fee in the sample): family pack 980 + 2 x double ka meetha 100 = 1180; 2 x veg biryani 260 + mirchi ka salan 120 = 640; 3 x mutton haleem 350 = 1050.
- Coupons: for example `WELCOME100` (first order, min ₹499), `BIRYANI10` (10% off, max ₹150, min ₹399), one expired coupon for testing.
- Customers: 5-8 fake customers with order history (so repeat customers and reorder suggestions work), some with loyalty points.
- Users for login: one admin, one kitchen staff per outlet, one manager, demo customers. Demo OTP is a fixed code only in demo mode. **[ASSUMPTION]**
- Local seed orders in the three states above, with timestamps computed relative to "now" so the "late" and "preparing" states always look right on demo day.

---

## 13. Recommended architecture **[ASSUMPTION: engineering choices, justify in the TDD]**

**One language (TypeScript) across everything. Few moving parts.**

| Layer | Choice |
|---|---|
| Frontend | Next.js (React) + Tailwind CSS + shadcn/ui (customer app, admin and kitchen display in one codebase, different route groups) |
| Backend | Node.js (Fastify API, or Next.js route handlers if kept on one long-running server) |
| Database | PostgreSQL with Prisma or Drizzle (migrations committed) |
| Real-time | **Server-Sent Events** per outlet channel, with Postgres `LISTEN/NOTIFY` (or in-process event bus for a single instance), plus a **polling fallback every 5 s** on the kitchen display |
| Auth | Session or JWT (httpOnly cookie); customer: mobile + mock OTP; staff/admin: email + password (hashed with argon2 or bcrypt); role checks in middleware |
| Validation | Zod on all request bodies, params and queries |
| Tests | Vitest (unit + integration against a test DB); optional Playwright for one happy-path E2E |
| Payments | **Own mock payment gateway** (see section 14) |
| Deploy | A **long-running Node host** (Render / Railway / Fly.io) + managed Postgres. **Do not host SSE on serverless functions.** |

### Suggested folder structure
```
/apps/web            Next.js app (customer, /admin, /kitchen)
/apps/api            API (if separate)
/packages/shared     Zod schemas, types, money + GST helpers
/prisma              schema, migrations, seed.ts
/tests               unit + integration
PROJECT_SPEC.md  README.md  deployment.md  .env.example
```

---

## 14. Payments (the area to go deepest)

### Mock gateway behaviour
A fake hosted payment page opened after "Pay". It simulates **UPI** (enter any VPA ending in a test handle) and **card** (test card numbers), with outcomes the reviewer can choose: **Success**, **Failure**, **Pending** (resolves to success or failure after a delay), and **Timeout/abandoned**.

### Flow
1. Customer reviews cart. **Server recomputes** the price (items, add-ons, portions, city price, coupon, loyalty redemption, GST-inclusive totals). The client-sent total is ignored.
2. `POST /checkout` creates an `order` in `PENDING_PAYMENT` and a `payment_attempt` with a unique **idempotency key**. Coupon use and loyalty points are **reserved** inside a DB transaction.
3. Redirect to the mock gateway. The gateway calls back `POST /payments/webhook` with a **signed payload (HMAC using `PAYMENT_WEBHOOK_SECRET`)**.
4. The webhook handler verifies the signature, then, **idempotently**:
   - `SUCCESS` -> mark paid, compute prep-time estimate + promised time, set order `PLACED`, route to outlet channel (kitchen screen receives it instantly), award loyalty points, finalise coupon use, write a mock "order confirmed" message.
   - `FAILED` / `TIMEOUT` -> mark failed, **release** reserved loyalty points and coupon, keep cart so customer can retry.
   - `PENDING` -> keep order pending; poll status; auto-expire after N minutes (release reservations).
5. **A repeated callback must never create two orders or double-award points.**
6. Re-validate at success time: items still available, outlet still open (if an item went out of stock while paying, flag for refund/cancel in mock). **[ASSUMPTION]**

### Business rules **[ASSUMPTION: values not in brief]**
- Coupons: minimum order value, expiry, usage limit, **one use per customer** for first-order coupons, percentage or flat with a cap. Reject invalid with a clear message.
- Loyalty: **earn 1 point per ₹10** on direct orders (on the amount actually paid); **redeem 1 point = ₹1**, up to a maximum share of the order (for example 20%); **points can never go negative**; points are earned only after successful payment.
- Cancelled / failed orders never keep points or coupon usage.
- Money stored as **integer paise**. No floating-point arithmetic for money.
- GST: all displayed prices are inclusive of 5% GST; receipt shows "Includes GST ₹x".

---

## 15. Data model (starting point; refine as needed)

- `users` (id, role, name, mobile, email, password_hash, outlet_id nullable, marketing_opt_in, marketing_opt_in_at, consent_accepted_at)
- `outlets` (id, name, type: outlet | cloud_kitchen, city, address, lat, lng, delivery_radius_km, fssai_no, min_prep_minutes, active_stations, opens_at, closes_at, is_open)
- `menu_items` (id, name, description, photo_url, is_veg, spice_level, allergens[], prep_minutes, base_price_paise, active)
- `item_portions` (item_id, label, price_delta_paise) and `item_addons` (item_id, name, price_paise)
- `city_prices` (item_id, city, price_paise) **(optional depth)**
- `menu_schedules` (item_id or category, daypart, start_time, end_time) **(optional depth)**
- `outlet_item_availability` (outlet_id, item_id, available, updated_by, updated_at)
- `coupons` (code, type, value, max_discount_paise, min_order_paise, valid_from, valid_to, usage_limit, per_user_limit)
- `coupon_redemptions` (coupon_id, user_id, order_id, status)
- `orders` (id, public_id like `WEB-778120`, customer_id, outlet_id, status, subtotal_paise, discount_paise, loyalty_redeemed_paise, total_paise, gst_paise, payment_method, placed_at, promised_at, ai_estimate_minutes, outlet_min_minutes, estimate_source, override_by, ready_at, handed_off_at, cancelled_at, cancel_reason, checkout_started_at)
- `order_items` (order_id, item_id, name_snapshot, portion, addons, qty, unit_price_paise)
- `order_events` (order_id, from_status, to_status, actor, at) **(audit trail of transitions)**
- `payment_attempts` (id, order_id, idempotency_key unique, method, status, gateway_ref, raw_payload, created_at)
- `loyalty_ledger` (user_id, order_id, points, type: earn | redeem | reserve | release, created_at) **(balance = sum; never negative)**
- `notifications` (id, order_id, user_id, channel: whatsapp | sms, kind: transactional | marketing, body, status, created_at) **(mock log)**
- `party_orders` (id, customer, event_date, guests, items, notes, status: requested | confirmed | declined, confirmed_by) **(optional depth)**
- Indexes: `orders(outlet_id, status, placed_at)`, `orders(customer_id, placed_at)`, `payment_attempts(idempotency_key)`.

### Order state machine (enforce on the server; reject invalid transitions)
```
PENDING_PAYMENT -> PLACED -> PREPARING -> READY -> HANDED_OFF -> (DELIVERED)
PENDING_PAYMENT -> PAYMENT_FAILED | EXPIRED
PLACED | PREPARING -> CANCELLED
```
"Late" is **derived** (`now > promised_at`), not a stored status. Late bands: on time, due soon (within 5 min), late, **late by 10+ minutes -> alert outlet manager and update the customer (mock message)**.

---

## 16. Screens and behaviour in detail

### 16.1 Customer web app (mobile first)
- **Landing / outlet picker:** pick area or use "Use my location" (browser geolocation); show nearest serving outlet or "Not delivering here yet". Show outlet name, open/closed, FSSAI number.
- **Menu:** large photos, veg/non-veg symbol, spice level, short scannable list with categories; add-ons and portions in a bottom sheet; price with "incl. 5% GST"; unavailable items clearly disabled; "Order again" row for returning customers (suggestions only).
- **Cart/checkout:** edit quantities, apply coupon, toggle "use loyalty points" (shows points balance and effect), delivery address (and location), payment method (UPI / card), single prominent Pay button. Show GST line. Target: under 60 seconds.
- **Payment:** mock gateway page; clear success/failure/pending handling and retry.
- **Order status (live):** stepper (Placed, Preparing, Ready, Out with rider), promised time, live updates via SSE, late updates ("Running a little late, new time 9:15 PM"). Receipt with GST.
- **Account:** order history, points balance, marketing consent toggle.
- Sign-in: mobile number + mock OTP.

### 16.2 Central menu admin (desktop)
- Item list with search/filter; create/edit item: name, description, photo upload (compress and limit size), veg/non-veg, spice level, allergens, base price, portions, add-ons, active flag.
- Outlet availability matrix (item x outlet toggles).
- Optional: prices by city, time-based menus.
- Validation errors shown inline; audit of who changed what (optional).
- Role: `admin` only.

### 16.3 Kitchen display (tablet, landscape)
- Columns or lanes: **New**, **Preparing**, **Ready**, **Handed to rider**.
- Each order card: big order number, items with quantity, **timer** counting since placed and time to promise, **colour by lateness**, customer notes/allergen notes.
- Large buttons: Accept/Start, Ready, Handoff. One tap each, no confirmations that slow the line (undo instead).
- **Live updates:** new orders appear instantly with a chime; connection indicator ("Live" / "Reconnecting, refreshing every 5s"); handles reconnect and missed events by refetching state.
- Mark item out of stock for the outlet.
- Manager: override the estimate; see late-order alerts.
- Role: `kitchen_staff` sees only their own outlet's orders (enforce on server).

### 16.4 Optional depth
- **Loyalty:** ledger, balance, tiers not required.
- **Dashboard (admin/manager):** per-outlet cards and table: orders, average prep time (promised vs actual), cancellations, repeat customers; date filter.
- **Party order form:** event date with minimum notice (for example 48 hours **[ASSUMPTION]**), guests, items, contact; status confirmed by a catering manager role.
- **Mock messages log** page showing WhatsApp/SMS messages sent.

---

## 17. Security and quality requirements

- No secrets in the repo; `.env.example` lists variable names only. Suggested: `DATABASE_URL`, `SESSION_SECRET` (or `JWT_SECRET`), `PAYMENT_WEBHOOK_SECRET`, `APP_BASE_URL`, `DEMO_MODE`, `UPLOAD_DIR` / storage settings.
- Role-based access control on every API route; kitchen staff restricted to their outlet; customers restricted to their own orders.
- Zod validation on all inputs; parameterised queries via the ORM; escape output; limit upload types and sizes.
- Rate-limit OTP and checkout endpoints; OTP expiry and attempt limits (mock OTP in demo mode only).
- Webhook signature verification; idempotency keys.
- Passwords hashed. Secure, httpOnly cookies.
- Logs must not contain personal data beyond what is needed.
- Performance: compress images, lazy-load, serve responsive sizes; keep kitchen page light.

### Tests (Vitest) for the important logic
1. Money and GST: inclusive-GST math in paise, rounding.
2. Pricing: portions, add-ons, coupon rules (min order, cap, expiry, per-user limit), loyalty redemption cap, **server ignores client total**.
3. **Payment webhook idempotency:** same callback twice creates one order and awards points once; invalid signature rejected.
4. Failed/expired payment releases coupon and loyalty reservations; points never negative.
5. Outlet routing by delivery radius (inside / outside / nearest open outlet); out-of-stock item rejected at order creation.
6. **Order state machine:** valid and invalid transitions.
7. **Prep-time rule:** `promised = max(AI estimate, outlet minimum)`; busy vs quiet kitchen; manager override.
8. Late-order rule: at 10 minutes past promise, alert is created once.
9. Access control: kitchen user cannot read another outlet's orders; customer cannot read another customer's orders.
10. (Optional) SSE: event delivered to the right outlet channel only.

---

## 18. Build order (7 days, solo)

| Day | Goal | "Done" means |
|---|---|---|
| 1 | Repo, DB schema, migrations, seed, auth with roles, design tokens | Can log in as each role; seeded data visible |
| 2 | Menu API + customer menu UI + cart + outlet picker | Browse menu with photos, add to cart, outlet chosen by location |
| 3 | Server-side pricing, coupons, GST, checkout + mock gateway + idempotent webhook | Pay success/fail/pending works; tests pass |
| 4 | Order state machine + prep-time estimate + kitchen display with SSE + polling fallback | Order placed on phone appears on kitchen tablet instantly; stages work |
| 5 | Menu admin + out-of-stock + live customer order status + late-order alert | Admin edits reflect on menu; late order turns red and alerts |
| 6 | Loyalty, mock message log, dashboard (small), polish all states, mobile checks | No dead buttons; empty/loading/error states everywhere |
| 7 | Tests, deploy, README, deployment.md, TDD, record a short walkthrough (optional) | Live URL works; reviewer can log in with demo accounts |

Cut order if time runs short: dashboard, party orders, time-based menus, city pricing, reorder suggestions. **Never cut:** payments correctness, kitchen real-time, tests, empty/error states.

---

## 19. Submission requirements (from the task brief)

Submit **one ZIP (up to 25 MB)** containing exactly two files:

### 19.1 Technical Design Document (PDF or Word)
- **GitHub URL at the top**, plus the live app link if deployed
- Architecture and why this architecture was chosen
- Data model, main flows, and how the AI part works (prep-time formula, what happens when wrong)
- UI and design decisions: key screens and why they look the way they do
- **What was cut, and what you would do next**
- **Every assumption labelled** (use the [ASSUMPTION] items in this spec)
- Honest notes about limits

### 19.2 deployment.md
- How to run locally, step by step
- How it is deployed, and the environment variables it needs (**names only, never values**)
- **Demo login details for the reviewer** (fake accounts for customer, kitchen staff, admin; demo OTP)

### Rules
- Use only the information in the problem statement; label every assumption.
- Keep the commit history. Do not put secrets or real personal data in the repo.
- Keep the repository public until review is finished.
- Resubmission allowed until the deadline; the latest version is reviewed.

### Scoring
- **Quality of work 50%**, **Problem solving 30%**, **Communication 20%**.
- Great = a product a client could try today; clean readable code; a UI that feels designed; honest notes about limits; extra depth that is well judged.
- Common mistakes to avoid: beautiful front end with nothing behind it; everything built but nothing working; no sample data; AI faked or not handling mistakes; TDD without a GitHub URL.

---

## 20. Acceptance checklist (agent: verify before finishing)

- [ ] Customer can pick location, get the right outlet, browse a menu with photos, customise items, and add to cart
- [ ] Prices shown include 5% GST and say so; FSSAI number visible; veg/non-veg symbols and allergens visible
- [ ] Coupon and loyalty redemption work; server recomputes all totals
- [ ] Mock UPI/card payment: success, failure, pending, timeout all handled; retry works
- [ ] Repeated payment callback does not duplicate the order or points (tested)
- [ ] Paid order appears **instantly** on the correct outlet's kitchen screen (SSE) with polling fallback
- [ ] Kitchen can move orders through stages, mark ready, hand off to rider; late orders are colour-coded and readable from two metres
- [ ] Promised time = max(prep-time estimate, outlet minimum); manager can override
- [ ] 10 minutes past promise triggers a manager alert and a customer update (mock message)
- [ ] Out-of-stock items vanish from the customer menu and cannot be ordered
- [ ] Admin can create/edit items, prices, photos, veg mark, spice level and per-outlet availability
- [ ] Roles enforced on server; kitchen staff see only their outlet
- [ ] Marketing consent is separate and opt-in; DPDP consent at registration
- [ ] Sample orders WEB-778120, WEB-778131, WEB-778146 are seeded
- [ ] Loading, empty and error states on every screen; works on a phone
- [ ] Tests pass; no secrets in the repo; `.env.example` present
- [ ] README, deployment.md and TDD written; live app deployed on a long-running host
