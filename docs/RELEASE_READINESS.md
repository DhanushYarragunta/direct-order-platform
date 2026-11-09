# Release readiness — 9 November 2026

## Current customer and restaurant completion release — deployed and verified

Commit **`7d5bbfe0449bcc15357ff299d3f7a9d3707c5c9c`** is **Live** in Render deployment **`dep-dboq7c7b9u1s73dub640`**, completed at **2026-11-09T10:45:09Z (16:15:09 IST)** after the GitHub push triggered automatic deployment. Runtime logs confirm that the ninth migration applied successfully and the application became ready. [GitHub Actions run 42602998263](https://github.com/DhanushYarragunta/direct-order-platform/actions/runs/42602998263), job `129111795987`, completed successfully, including the isolated database/browser suites and Docker build. CI evidence is `.local/customer-completion-ci.json`. All **23 hosted API checks passed at 10:48:35 UTC / 16:18:35 IST**, including anonymous root/favourites login redirects, profile/favourites and coupon-table contracts, administrator reads, session logout/revocation and location search. Only the verification script's session was created/revoked; no hosted customer, coupon, order or payment writes were performed. The location search returned six real Photon results. Evidence: `.local/customer-completion-live-verification.json`.

The update adds persisted favourites and profile navigation, explicit past-order review, saved-contact/address reuse and typed venue search in catering, an administrator coupon manager, kitchen ticket/stock search and an overdue-only view. Phone navigation and the reorder dialog received visual checks. Login-first behavior remains in place.

The ninth additive migration, `20261109160000_customer_completion`, creates favourites, adds coupon edit versions and snapshots/backfills each order's first-order restriction. Coupon changes affect new checkouts; existing monetary amounts and first-order terms remain intact. No production seeding is required. Favourites are exported and erased with account data.

TypeScript, the production build, **233 unit tests** and **133 isolated database integration tests** passed locally. Integration evidence is preserved in `.local/customer-completion-integration.json`. All **65 browser scenarios** passed (59 core, one gateway and five registration/recovery). After the final reorder allergen disclosure, the build/unit checks and all five new customer-completion scenarios passed again. Evidence: `.local/core-verification.json`, `.local/gateway-browser.json`, `.local/registration-browser.json`, `.local/customer-completion-focused.json` and screenshots. The same-URL login navigation test now waits for the actual redirect before typing; its five cases also passed three repeated runs. The deployed source is identified above. Provider acceptance limits below still apply.

## Preceding login-first release — deployed and verified

Commit **`b8617c55f4f3959fd00127388ccb8516198a6290`** is **Live** in Render deployment **`dep-dboose3l550s73aeov30`**, completed at **2026-11-09T09:13:20.175341Z (14:43:20 IST)** after a manual Render trigger. It supersedes `36cec81`, recorded below. Logs confirmed no pending migrations and successful startup on port `10000`; all eight migrations remain applied. [CI run 42589984250](https://github.com/DhanushYarragunta/direct-order-platform/actions/runs/42589984250), job **`129069002647`**, succeeded, including the check/build, isolated database/browser verification, gateway and registration fixtures, Docker image build and cleanup. CI evidence is `.local/login-first-ci-verification.json`.

The root server page calls `currentUser()` before rendering the menu and redirects signed-out or invalid-session visitors to `/login?next=/`. Valid sessions retain menu access. Successful login replaces the document at the validated return path so an earlier cached signed-out redirect cannot strand the new session. Existing API authorization and public help/privacy routes are unchanged.

Local verification passed **227 unit tests and 60 browser scenarios** (54 core, one hosted-checkout fixture and five registration/recovery scenarios), plus TypeScript and the production build. The new browser scenarios cover signed-out entry without JavaScript, password login and reload, invalid/expired or revoked cookies, and Back after logout. The latest **128 local database integration tests** passed at the preceding profile/search checkpoint; no database changes were added. The new release's CI independently passed its isolated database verification step.

All **19 hosted smoke checks passed at 2026-11-09T09:21:01.467Z (14:51:01 IST)**. The original profile/search checks passed along with HTTP `307` redirects to login before authentication and after session revocation, and HTTP `200` menu access while authenticated. An independent anonymous root request also returned HTTP `307` with `Location: /login?next=/`. Evidence is `.local/profile-search-live-verification.json`, labelled with the verified commit and Render deployment. The script created and revoked only its own administrator verification session; no hosted customers, profiles, saved addresses, orders or paid actions were changed.

The latest location-search check returned **one supported-area fallback result** (`provider: local`). This validates the fallback path but does not establish Photon availability at this checkpoint. The preceding `36cec81` check returned six real Photon results; its separate record is preserved below. Food-search keyboard behavior was reviewed in the browser for that preceding profile/search release and is not asserted by the API-only smoke script.

## Preceding profile, saved-address and search release — deployed and verified

Commit **`36cec8145ab427574b06f33af52ca4662adefa00`** went **Live** in Render deployment **`dep-dbomufq9lscs73d6rupg`** at **2026-11-09T07:14:47Z (12:44:47 IST)**. [CI run 42576412352](https://github.com/DhanushYarragunta/direct-order-platform/actions/runs/42576412352) passed for this commit. Startup applied the additive eighth migration, `20261109090000_customer_profiles`, before starting the new application.

The customer avatar now opens a profile inspired by the supplied Swiggy/Zomato references: identity card, Edit profile, quick actions, grouped account links and saved-address management. Customers can edit their name and mobile number, save up to ten Home/Work/Other addresses and choose a default. The default address and recipient number fill checkout after a reload. Staff profiles remain read-only and retain their workspace navigation.

Food search adds dish/category suggestions, keyboard selection, vegetarian filtering and clear/reset states. Delivery search accepts typed Hyderabad areas, buildings and landmarks through Photon/OpenStreetMap; supported-area centres remain a labelled fallback. Saved addresses are account-scoped, exported with account data and removed by account erasure. The additive eighth migration is `20261109090000_customer_profiles`.

Verification passed **227 unit tests, 128 database integration tests and 55 browser scenarios** (49 core, one hosted-checkout fixture and five registration/recovery scenarios), TypeScript and the production build. Browser checks cover persistent defaults, recipient autofill, failed refresh recovery, account switching, delayed address-save completion, stale-quote invalidation, typed-location delivery, GPS routing and existing payment/signup flows. The revised profile was visually reviewed at 320px, 390px and 1440px. Evidence: `.local/core-verification.json`, `.local/gateway-browser.json`, `.local/registration-browser.json` and `.local/screenshots/profile-*.png`. The integration tests passed before the final frontend refinements; the core browser suite was rerun against the final production build.

All **16 hosted API smoke checks passed at 2026-11-09T07:17:56Z (12:47:56 IST)**. They cover health and menu reads, anonymous profile/address rejection, search validation and cross-site rejection, administrator password login, authenticated profile/address contracts and verification-session logout/revocation. The profile read exercises the new `SavedAddress` relation, which the health endpoint alone cannot establish. The real Photon request returned **six results**. Historical evidence is preserved in `.local/profile-search-release-36cec81-verification.json`.

A hosted browser review confirmed keyboard food-search selection returning **eight Biryani results** and visible administrator profile navigation. No hosted customer creation, profile/address changes, orders or paid actions were performed; the API check created and revoked only its own verification session. Automated payment/email fixtures do not establish real provider acceptance, and these hosted checks did not test customer address writes or checkout.

## Historical account access release — deployed and verified

Commit **`27546c0a125688351033ef7ba1439dc950b1565e`** was **Live** in Render deployment **`dep-dbo4iffavr4c73b1erhg`** before the profile/search release superseded it. On **9 November 2026**, the signed-in Render dashboard independently confirmed that exact commit, deployment and owner-approved **My Workspace**. At that checkpoint, application logs showed all seven migrations found, no pending migrations and successful startup, with no application errors visible in the reviewed one-hour window.

This deployed release adds an accessible account dialog with sign-out on phones and tablets, recoverable sign-out errors, retryable privacy preferences and accurate deletion confirmation even if the follow-up account refresh fails. Deterministic email-provider rejections now direct users to support or existing-account password login; temporary failures retain retry guidance. The registration form links to account-access help. Email verification remains required before registration.

Local verification passed **196 unit tests, 115 database integration tests and 43 browser scenarios** (37 core, one hosted-checkout fixture and five registration/recovery scenarios), TypeScript and the production build. Customer account controls at 390px and administrator controls at 320px were visually reviewed; the narrow administrator dialog scrolls to sign-out without horizontal overflow. Provider calls in automated suites were intercepted or mocked.

[CI run 42469869009](https://github.com/DhanushYarragunta/direct-order-platform/actions/runs/42469869009), job **`128697901602`**, passed for this exact commit at **15:43:34 IST on 8 November 2026**. A fresh API/log review on 9 November confirmed **196 unit tests, 115 database tests and 43 browser scenarios** (37 core + one gateway + five registration/recovery), TypeScript, production build, Docker image build, artifact upload and cleanup. The sanitized local CI evidence is `.local/account-release-ci-verification.json`.

All **seven hosted account-access checks passed again at 11:13:36 IST on 9 November**. They cover health/database reachability, administrator password login, mobile navigation and sign-out, privacy preference loading, the deployed account-help heading, session revocation and anonymous administration rejection. The script's commit/deployment labels were checked independently against Render above. Evidence is `.local/account-access-live-verification.json`; the mobile capture is `.local/screenshots/account-access-live.png`. Only the verification session was signed out. These checks do not establish email delivery or customer checkout acceptance.

After the owner approved the [production-access request](SES_PRODUCTION_ACCESS_REQUEST.md), AWS granted SES access in `ap-south-1` on **8 November**: `ProductionAccessEnabled=true`, `SendingEnabled=true`, `EnforcementStatus=HEALTHY`, review status **`GRANTED`**. The signed-in console reconfirmed **“You are in Production”** and **Healthy** on **9 November**, with a quota of **50,000 emails/day** and **14 emails/second**. Individual recipient verification in SES is no longer required. No sending domain is configured; actual signup/recovery receipt and inbox placement after approval remain unverified. Existing accounts can use password sign-in without email OTP. No provider settings or messages were changed during this verification.

## Preceding AI demonstration release — deployed and verified

Commit **`82f5cfc02883f8163dcfba791a4e1f4a1293bc0e`** was deployed successfully in Render deployment **`dep-dbnpes0473hc739u1d2g`**. The dashboard confirmed the exact commit and successful deployment state at that historical checkpoint; subsequent account-access and profile/search releases are recorded above.

The release adds mobile reorder cards, honest checkout/tracking explanations and the ADMIN/MANAGER AI workspace at `/workspace/ai`. Its 300 explicitly synthetic training examples stay in memory, with separate `demo-ridge-prep-v1` / `demo-rules-v1` provenance; live learning still requires at least 60 qualifying completed orders. Current/busy loads, full/20-example history, unusual-load fallback, minimum-respecting overrides and ten-minute-late alerts can be previewed. Scenario messages are labelled preview-only and are neither sent nor saved. No training orders were inserted, and cloud/provider settings were unchanged.

Local verification passed **196 unit tests, 112 database integration tests and 38 browser scenarios** (33 core, one hosted-checkout fixture and four registration/recovery scenarios), plus TypeScript and the production build. All seven migrations were applied in isolated databases. The 33 core scenarios passed again after the test synchronization correction below; automated provider transport remained intercepted or mocked.

All **19 hosted checks passed on this exact commit at 03:00:37 IST on 8 November 2026**. The sanitized `.local/render-ai-verification.json` identifies both `verifiedCommit` and `verifiedRenderDeploy`. Checks cover the synthetic model `demo-ridge-prep-v1:cb836afbf196`, current/busy examples (25/41 minutes), sparse/unusual-load fallbacks, late/override previews, access/origin/schema rejection, 15-day authentication, 60 menu items across three outlets and logout. A live browser review also confirmed the AI workspace and late-message preview; its screenshot is `.local/screenshots/ai-workspace-live.jpg`. Synthetic evaluation errors do not measure restaurant accuracy.

[CI run 42415842181](https://github.com/DhanushYarragunta/direct-order-platform/actions/runs/42415842181), job **`128533625015`**, passed for the exact deployed commit at **03:05:25 IST on 8 November 2026**. Its logs confirm **196 unit tests, 112 database tests and 38 browser scenarios** (33 core + one gateway + four registration/recovery). TypeScript, the production build, Docker image build, artifact upload and cleanup all passed.

The preceding AI commit `33abacad` failed [CI run 42414951751](https://github.com/DhanushYarragunta/direct-order-platform/actions/runs/42414951751) when hydration replaced a browser-test element. Commit `82f5cfc` changed only test synchronization: locator trial-click retries wait through that replacement. Application behavior and cloud settings were unchanged.

## Preceding menu/authentication release

Commit **`de354569c052cfa6eabfc1b86ae87d752171be4f`** deployed successfully in Render deployment **`dep-dbno6jgae00c738vmtl0`**. All **seven migrations** available at that checkpoint were applied, including `20261108010000_password_recovery`.

The approved additive catalogue import inserted **53 dishes and 159 availability rows**. A subsequent dry run reported **zero changes**. Kondapur, Kukatpally and Gachibowli now each return **60 available dishes**, and all **60 catalogue JPEG URLs returned HTTP 200**. The original seven dishes, three outlets and existing records were preserved.

The exact deployed commit passed [GitHub Actions run 42408895843](https://github.com/DhanushYarragunta/direct-order-platform/actions/runs/42408895843), job `128512527152`, completed **8 November 2026 at 01:38:07 IST**: **162 unit tests, 107 database tests and 33 browser scenarios** (28 core, one gateway and four registration/recovery). TypeScript, the production build, Docker build and cleanup also passed. The earlier checkpoints below are historical evidence; provider acceptance and hosting limitations remain listed separately.

## Earlier verified release

The earlier release passed 152 unit tests, 87 isolated database tests, 28 core browser scenarios, one hosted-checkout browser fixture and two non-demo registration browser scenarios. TypeScript, the production build and the Linux ARM64 Docker build passed. Provider fixtures do not send messages or move money. Six migrations were applied locally at that checkpoint.

Those fixes prevent immediate webhook retries in non-UTC database sessions, show failed/blocked webhook updates to administrators, preserve refund failure details until every affected payment is reconciled, and remount the then-existing signup/code-login inputs when switching steps so password or OTP text cannot become a contact field.

GitHub Actions also passed for release commit `d4a0bdd55bc983f3e3d9f9e624eab9114814d75d`: [run 42403715322](https://github.com/DhanushYarragunta/direct-order-platform/actions/runs/42403715322), job `128496801624`, completed **8 November 2026 at 00:33:07 IST**. TypeScript/tests/build, isolated database and core browser checks, hosted-checkout fixtures, non-demo registration fixtures and the deployment-image build all succeeded.

The subsequent deployed commit `36f2e349320957bf084aba0be7a32d2832dcd415` also passed [GitHub Actions run 42405330915](https://github.com/DhanushYarragunta/direct-order-platform/actions/runs/42405330915) at **00:52:12 IST on 8 November**: 158 unit tests, 89 database tests, 28 core browser scenarios, one gateway scenario, two registration scenarios, TypeScript, production build and Docker image build. These counts describe that completed historical checkpoint.

## Menu and authentication revision

The owner requested a **60-item demonstration menu** and password-based sign-in using either email or mobile number. The deployed revision includes that catalogue expansion, optional normalized signup phone numbers, email/SMS password recovery and **15-day new sessions**. Signup still verifies email before creating an account; an optional signup phone is not treated as verified until a separate authenticated SMS check. Ordinary email/phone OTP sign-in is disabled. Forgot password requires a code sent to a preverified account contact, then a new password; success revokes all sessions and requires explicit password login.

The final CI run above covers all category filters, phone/password login, persistent cookies, reset delivery, replay rejection and session revocation. The seventh password-recovery migration and hosted catalogue import are complete. Provider fixtures establish application behavior; real message delivery remains subject to the provider restrictions below.

The owner clarified that this is a demonstration project and has no existing SMS sender/provider setup. Read-only AWS inspection found `ap-south-1` SMS account tier **SANDBOX**, with **no registrations and no sender IDs**. SMS recovery is implemented and tested with mocked AWS/Twilio transports; real SMS is unavailable and no SMS enablement was applied. The new interface reports SMS recovery unavailable and offers verified-email recovery. Password-reset codes are never displayed or faked. SES was still sandboxed at this menu/authentication checkpoint; its subsequent production approval is recorded above. The public Render database remains in non-demo authentication mode.

## Completed judges' administrator setup

At the owner's explicit request, **Judging Demo Admin** (`judge@deccan.example`) was provisioned as one `ADMIN` account in the existing Render database. The reserved `.example` address is a password-login identifier only. Verified-contact fields remain unset, and this account's password login does not require email OTP. Provisioning was limited to the new account; existing users, orders, menu, outlets and configuration were preserved.

Live password login returned HTTP 200 with the `ADMIN` role and a **15-day Secure, HttpOnly session cookie**. Authenticated `/api/auth/me`, `/api/admin/menu` (60 items, three outlets), `/api/admin/outlets` and `/api/admin/services` all returned HTTP 200; anonymous `/api/admin/menu` returned HTTP 401. The API verification session was logged out. A separate browser sign-in reached the management dashboard without OTP and was left open for the owner. Initial administrator setup is complete; the password is not recorded here.

## Initial Render inspection — before the update

Inspection found workspace **My Workspace**, project **My project**, environment **Production**, web service **direct-order-platform** (`srv-dbmb46gu01pc738tcodg`) and existing PostgreSQL 16 database **direct-order-db** (`dpg-dbmb6e2jnfac738v3g0g-a`) in Singapore. The database is currently ungrouped. No separate worker is provisioned.

The web service uses the repository's `main` branch and Dockerfile on the Free plan. At the initial inspection, the deployed commit was `2403bad`. Its environment contained `APP_ORIGIN`, `DATABASE_URL`, `NODE_ENV`, `PORT` and `PRIVACY_CONTACT`; values were kept masked. No payment/email settings or environment groups were present. Docker Command was unset, and the Free plan did not expose Pre-Deploy Command. These are historical findings; the approved configuration below has since been applied.

Before the update, runtime logs repeatedly reported database/Prisma failures from order maintenance. The readiness endpoint can succeed even when application tables are missing or incompatible. The completed migration record below supersedes the earlier schema uncertainty. Free hosting still spins down when inactive, so it cannot provide continuous background reconciliation.

## Earlier Render update — seven-item checkpoint

The earlier Render deployment **`dep-dbnn8hng6t6s73cdb0dg`** succeeded on commit **`d4a0bdd`**. Startup applied the six migrations then present before starting the application: core, remaining scope, quality, live services, worker status and the gateway webhook inbox. The owner-approved test-mode environment settings and Docker Command below were applied to the existing service. The subsequent 60-item rollout, profile/search migration and current eight-migration login-first release are recorded above.

| Hosted check | Historical observed result |
| --- | --- |
| `/api/health` | HTTP 200 |
| `/login` | HTTP 200 |
| `/api/auth/methods` | HTTP 200 |
| Menu API for Kondapur, Kukatpally and Gachibowli | All three return HTTP 200, with seven available dishes and two add-ons |
| Seven catalogue `/food/*.jpg` URLs | All return HTTP 200 with JPEG content |
| Customer homepage/menu and cart | Visually verified seven dishes; adding the regular chicken biryani shows a ₹320 cart total |

Immediately after deployment, the menu API returned HTTP 404 because migrations created the schema without business records. The owner subsequently approved the reviewed catalogue, and that approved payload was imported into the existing Render database over a TLS connection with certificate verification (`verify-full`). The import inserted **33 records: three outlets, seven menu items, two add-ons and 21 outlet-availability rows**. It did not create customers, administrators, orders or licence-verification declarations.

The reported homepage/menu failure is now resolved: the approved catalogue renders and the cart displays the expected ₹320 price. These checks establish browsing and cart behaviour; they do not establish completed hosted signup, message delivery, payment recovery or end-to-end ordering acceptance. Initial administrator setup was pending separate identity approval at this checkpoint; the subsequently approved judges' account is recorded above.

Render's database UI warns that the current **Free PostgreSQL database expires on 5 December 2026**. No plan upgrade or resource change was made. Arrange an approved continuity/export plan before that date; current Free hosting also cannot provide continuous background reconciliation while it sleeps.

## Applied owner-approved test configuration

The owner approved this test-mode setup on 8 November 2026. The update reused the existing service, database, region and Free plan. Existing data, origin, database URL and privacy contact were preserved. Shared demo accounts remain disabled.

| Setting/action | Applied value or purpose |
| --- | --- |
| Docker Command | `node scripts/start-render.mjs` so additive migrations complete before the new application starts; a dedicated script avoids Render's Docker command quote parsing |
| `DEMO_MODE` | `false` |
| `PAYMENT_PROVIDER` | `razorpay` |
| `ALLOW_PUBLIC_TEST_PAYMENTS` | `true`, with no real-money checkout |
| Razorpay keys and webhook secret | Existing local **test** configuration copied into the service's secret environment settings; values were not committed or printed |
| `SUPPORT_EMAIL` | Existing verified sender/contact supplied by the owner |
| `EMAIL_PROVIDER`, `AWS_REGION`, `EMAIL_FROM` | SES, `ap-south-1`, existing verified sender |
| AWS sending identity/credentials | Dedicated `deccan-render-ses-test` credential limited to `ses:SendEmail` from the verified identity in `ap-south-1`; entered in Render secret settings without using the owner's administrative login |
| `TRANSACTIONAL_EMAIL_ENABLED` | `true`; SES production access was subsequently granted on 8 November and reconfirmed on 9 November |
| `TRANSACTIONAL_SMS_ENABLED` | `false` |
| `RUN_BACKGROUND_JOBS` | `true`, because this existing service has no separate worker; jobs stop while Free hosting sleeps |

The original seven-item catalogue initialization and the requested 60-item expansion are complete. The authentication revision is deployed and its migration is applied. The owner-approved judges' administrator account is provisioned and verified. Do not run the demo seed or invent licence verification. Hosted signup, real message delivery and end-to-end order-flow acceptance remain to be completed under the provider restrictions below.

## Remaining provider checks

- The existing Razorpay test transaction captured ₹320. Provider reads confirm ₹0 refunded and no refund records. Both documented refund request paths returned HTTP 400; the exact provider-side cause is unconfirmed. Keep the full refund pending and review balance/payment eligibility in the merchant dashboard.
- SES production access is granted and the existing email sender is verified. Feedback forwarding and bounce/complaint suppression were enabled at the previous provider check. A prior test email arrived in Spam. Verify actual signup and recovery receipt after approval, configure a sending domain and check inbox placement before a dependable launch.
- The SMS account is sandboxed with no registrations or sender IDs. The application path is implemented and mock-tested, but no actual SMS code or update has been sent by this revision and no provider setup was enabled.
- Configure the matching test webhook at `/api/payments/razorpay/webhook` and verify provider-triggered recovery against the updated host. The deployment has succeeded, but public provider delivery has not yet been confirmed; local signed webhook tests do not prove it.
- Live merchant activation, live keys, sender approval, persistent worker hosting and operational recovery checks are required before accepting real customer orders. SMS additionally requires the applicable sender/template registration.
