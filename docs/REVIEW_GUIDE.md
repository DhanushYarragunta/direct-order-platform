# Review the local candidate

For local/demo review, open http://127.0.0.1:3000 with `DEMO_MODE=true` and use the Customer, Admin, Manager and outlet Kitchen buttons at `/login`. Separate browser profiles keep sessions independent. On the hosted demonstration, use `judge@deccan.example` with the password supplied privately; the local demo shortcuts are disabled.

The AI/mobile revision passed local TypeScript/build, 196 unit tests, 112 integration tests and 38 browser scenarios. CI and deployment remain pending; see RELEASE_READINESS.md.

## Suggested review order

1. **Menu and checkout:** choose portions/extras, try filters, switch outlets, then complete a test payment. Check the live kitchen and customer stages through pickup handoff or delivery dispatch and delivered.
2. **Coupons and loyalty:** add two biryanis, apply BIRYANI10 and use points. Inspect payment/receipt totals. Cancel before preparation to check the returned balance. Register a fresh customer to try WELCOME100; the supplied customer already has orders.
3. **Menu rules:** as Admin, edit prices and add a Hyderabad override. Set a serving window outside the current time, then verify ordering is unavailable. Kitchen staff can still switch stock independently. Remove the schedule/override to restore your preferred demo state.
4. **Party orders:** request an event at least 24 hours ahead. Confirm or decline in the matching manager's Party requests screen. Review the response as Customer. Requests can be cancelled while awaiting a response.
5. **Reporting:** compare all kitchens, select one outlet, and switch 24-hour/7-day/30-day periods. Sample history is invented and clearly separate from the three brief orders.
6. **Responsive design:** inspect menu, cart, rewards and catering at a phone width; inspect kitchen at tablet width. Note design changes by screen and the intended behaviour.
7. **Recovery:** start a delayed payment, return to the menu and add another dish or quantity, then reopen the payment. Only the purchased quantities are removed. Revisiting that paid URL again keeps the remaining cart. A failed menu request at checkout now offers Try again.
8. **Performance evidence:** run `npm run test:performance` after building, separately from browser verification. Review `docs/PERFORMANCE.md` for the local sample's limits; use real people and target devices to assess the 60-second checkout target.

## AI demonstration review

As Admin or Manager, open `/workspace/ai` in demo mode or the explicitly enabled public Razorpay test environment. Managers can inspect only their assigned outlet.

1. **Current kitchen / Busy kitchen:** inspect the current queue, the learned preparation result and the kitchen minimum; change workload or station capacity and evaluate.
2. **Limited history / Unusual load:** compare the full 300-example history with 20 examples, then try the unusual load. Read the stated fallback reason and kitchen-load result.
3. **Manager override / Ten minutes late:** verify that the override cannot go below the kitchen minimum, and preview the customer update and manager alert at ten minutes past the promise.
4. **Provenance:** expand the synthetic evaluation details. The examples exist only in memory, errors do not measure restaurant accuracy, and every message is labelled preview-only. Scenarios create no orders, send/save no messages and change no operational promises.

On a phone, sign in as the seeded Customer and inspect the available reorder suggestions. Scroll the cards, choose a dish and change its portion; the cart must remain unchanged until Add.

## Architecture review

Read `docs/TECHNICAL_DESIGN.md`; use `docs/RENDER.md` for self-deployment. Generated PDFs are optional local artifacts. Key review decisions are one Next.js/PostgreSQL application, server-priced transactions, an auditable rewards ledger, IST serving rules, scoped staff access, and separate synthetic/live learned estimates with explicit fallback reasons and manager oversight.

Run `npm run verify:core` to reproduce all checks against an isolated test database. The command migrates and non-destructively seeds the working demo, then runs type checks, domain tests, a production build, database integration tests and browser checks. Screenshots and the machine-readable result are under `.local/`.

The optional assessment package can be regenerated after browser verification with `scripts/build-tdd.py`; generated PDFs and ZIPs were removed during folder cleanup. An existing Render deployment is available, but its web and worker releases must be checked against the reviewed commit. Local changes are not published automatically. Follow the upgrade and staging instructions in `docs/RENDER.md`; generated binaries, duplicate photos and previews are excluded from Git.

## Quality fixes to exercise

- Start from Kondapur, then select Kukatpally / 500072 at delivery checkout. Verify the routed outlet, current cart price, kitchen-load estimate and delivery fee before payment; advance the order through delivered.
- At 1024px tablet width check 30px ticket IDs, 26px timers, 24px item names and readable modifiers. Enable sound/wake lock with a tap. Disconnect the network and observe offline/last-synced and disabled writes; reconnect. Use the physical protocol in ACCEPTANCE_TESTING.md before claiming two-metre readability.
- On mobile, the promotional hero is hidden, reorder suggestions remain visible and allergens are at least 14px. Check the 60-dish menu, nine categories and photo-credit page; verify no horizontal viewport overflow at 320px and 390px.
- Admin menu: upload a JPEG/PNG/WebP, edit delivery rules, and inspect the licence declaration workflow. Zero-prefixed demo values cannot be declared verified.
- Privacy: export your customer data, withdraw marketing permission and anonymize an account with no active orders. Ordinary sign-in uses email/mobile plus password. Codes are reserved for signup, password recovery and contact verification; provider configuration and verified contacts govern delivery, and recovery codes are never displayed or faked.
- Reports: compare the existing repeat-purchaser count with eligible/pending 30-day cohorts. Record a completed-period app-order baseline for one outlet and verify the direct/app denominator. Timings exclude absent measurements and distinguish demo from live browser samples.
- Run the isolated five-minute `npm run test:soak`; it adds evidence, not a production-capacity claim. Use the one-hour staging and human-study procedures before launch.


## Live-services review

This release adds hosted Razorpay payments/refunds, authenticated PDF receipts, email/mobile password sign-in and signup/recovery/contact-verification codes, AWS messaging adapters, and administrator service diagnostics. **Workspace → Services** reports configured services, independent worker activity, queue ages and payment recovery references. Refresh after stopping the only worker: reports become stale after 90 seconds; restart it and refresh to observe recovery. In local development jobs may run inside the web process, so use a separate worker with `RUN_BACKGROUND_JOBS=false` on the web process for that exercise. Provider transport is mocked in automated tests; account credentials, sender/merchant approval and controlled live acceptance remain required. Follow [LIVE_SERVICES.md](LIVE_SERVICES.md). The live preparation model requires at least 60 qualifying completed orders and chronological validation. The separate demonstration model uses only synthetic in-memory examples; the AI workspace never triggers provider delivery or changes provider settings.
