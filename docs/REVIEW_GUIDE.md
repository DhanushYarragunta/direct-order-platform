# Review the completed local candidate

Open http://127.0.0.1:3000. Use the Customer, Admin, Manager and outlet Kitchen buttons at `/login`; separate browser profiles keep customer and staff sessions independent.

## Suggested review order

1. **Menu and checkout:** choose portions/extras, try filters, switch outlets, then complete a test payment. Check the live kitchen and customer stages through pickup handoff or delivery dispatch and delivered.
2. **Coupons and loyalty:** add two biryanis, apply BIRYANI10 and use points. Inspect payment/receipt totals. Cancel before preparation to check the returned balance. Register a fresh customer to try WELCOME100; the supplied customer already has orders.
3. **Menu rules:** as Admin, edit prices and add a Hyderabad override. Set a serving window outside the current time, then verify ordering is unavailable. Kitchen staff can still switch stock independently. Remove the schedule/override to restore your preferred demo state.
4. **Party orders:** request an event at least 24 hours ahead. Confirm or decline in the matching manager's Party requests screen. Review the response as Customer. Requests can be cancelled while awaiting a response.
5. **Reporting:** compare all kitchens, select one outlet, and switch 24-hour/7-day/30-day periods. Sample history is invented and clearly separate from the three brief orders.
6. **Responsive design:** inspect menu, cart, rewards and catering at a phone width; inspect kitchen at tablet width. Note design changes by screen and the intended behaviour.
7. **Recovery:** start a delayed payment, return to the menu and add another dish or quantity, then reopen the payment. Only the purchased quantities are removed. Revisiting that paid URL again keeps the remaining cart. A failed menu request at checkout now offers Try again.
8. **Performance evidence:** run `npm run test:performance` after building, separately from browser verification. Review `docs/PERFORMANCE.md` for the local sample's limits; use real people and target devices to assess the 60-second checkout target.

## Architecture review

Read `docs/TECHNICAL_DESIGN.md`; use `docs/RENDER.md` for self-deployment. Generated PDFs are optional local artifacts. Key review decisions are one Next.js/PostgreSQL application, server-priced transactions, an auditable rewards ledger, IST serving rules, scoped staff access, and an explainable preparation baseline with manager oversight.

Run `npm run verify:core` to reproduce all checks against an isolated test database. The command migrates and non-destructively seeds the working demo, then runs type checks, domain tests, a production build, database integration tests and browser checks. Screenshots and the machine-readable result are under `.local/`.

The optional assessment package can be regenerated after browser verification with `scripts/build-tdd.py`; generated PDFs and ZIPs were removed during folder cleanup. Render self-deployment files are ready, but public hosting has not been provisioned. The previous feature checkpoint is public; quality changes are committed locally after checks. Review the focused commits before pushing them; generated binaries, duplicate photos and previews are excluded from Git.

## Quality fixes to exercise

- Start from Kondapur, then select Kukatpally / 500072 at delivery checkout. Verify the routed outlet, current cart price, kitchen-load estimate and delivery fee before payment; advance the order through delivered.
- At 1024px tablet width check 30px ticket IDs, 26px timers, 24px item names and readable modifiers. Enable sound/wake lock with a tap. Disconnect the network and observe offline/last-synced and disabled writes; reconnect. Use the physical protocol in ACCEPTANCE_TESTING.md before claiming two-metre readability.
- On mobile, dishes appear ahead of the promotional hero and allergens are at least 14px. Verify all seven dish photos and the photo-credit page.
- Admin menu: upload a JPEG/PNG/WebP, edit delivery rules, and inspect the licence declaration workflow. Zero-prefixed demo values cannot be declared verified.
- Privacy: export your customer data, withdraw marketing permission and anonymize an account with no active orders. Phone-code login is explicitly a demo simulation.
- Reports: compare the existing repeat-purchaser count with eligible/pending 30-day cohorts. Record a completed-period app-order baseline for one outlet and verify the direct/app denominator. Timings exclude absent measurements and distinguish demo from live browser samples.
- Run the isolated five-minute `npm run test:soak`; it adds evidence, not a production-capacity claim. Use the one-hour staging and human-study procedures before launch.
