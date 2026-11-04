# Review the completed local candidate

Open http://127.0.0.1:3000. Use the Customer, Admin, Manager and outlet Kitchen buttons at `/login`; separate browser profiles keep customer and staff sessions independent.

## Suggested review order

1. **Menu and checkout:** choose portions/extras, try filters, switch outlets, then complete a test payment. Check the live kitchen and customer stages through handoff.
2. **Coupons and loyalty:** add two biryanis, apply BIRYANI10 and use points. Inspect payment/receipt totals. Cancel before preparation to check the returned balance. Register a fresh customer to try WELCOME100; the supplied customer already has orders.
3. **Menu rules:** as Admin, edit prices and add a Hyderabad override. Set a serving window outside the current time, then verify ordering is unavailable. Kitchen staff can still switch stock independently. Remove the schedule/override to restore your preferred demo state.
4. **Party orders:** request an event at least 24 hours ahead. Confirm or decline in the matching manager's Party requests screen. Review the response as Customer. Requests can be cancelled while awaiting a response.
5. **Reporting:** compare all kitchens, select one outlet, and switch 24-hour/7-day/30-day periods. Sample history is invented and clearly separate from the three brief orders.
6. **Responsive design:** inspect menu, cart, rewards and catering at a phone width; inspect kitchen at tablet width. Note design changes by screen and the intended behaviour.

## Architecture review

Read `docs/TECHNICAL_DESIGN.md` or `output/pdf/technical-design.pdf`. Key review decisions are one Next.js/PostgreSQL application, server-priced transactions, an auditable rewards ledger, IST serving rules, scoped staff access, and an explainable preparation baseline with manager oversight.

Run `npm run verify:core` to reproduce all checks against an isolated test database. The command migrates and non-destructively seeds the working demo, then runs type checks, domain tests, a production build, database integration tests and browser checks. Screenshots and the machine-readable result are under `.local/`.

The assessment package is `output/submission.zip`, containing only the TDD PDF and `deployment.md`. Public hosting is not configured. No commit or push was made for this candidate; review, commit and push before final submission so the linked repository includes these changes.
