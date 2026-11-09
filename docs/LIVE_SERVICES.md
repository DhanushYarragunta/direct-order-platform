# Payments, verification and order messages

The application includes Razorpay hosted checkout, downloadable PDF receipts, customer email and phone verification, and a durable order-notification outbox. Amazon SES email and AWS End User Messaging SMS are the default communication providers. Resend email and Twilio SMS/Verify remain optional alternatives.

The local tests replace provider calls with fixtures. They verify application behaviour without charging a card, sending email/SMS, or proving that a provider account, sender identity, webhook or production deployment is active. The administrator's **Services** page at `/workspace/services` reports configuration, background processing and queues; “configured” means the required settings are present.

## Choose a mode

| Mode | Configuration and behaviour |
| --- | --- |
| Local demonstration | `DEMO_MODE=true`, `PAYMENT_PROVIDER=demo`. Payments and communication deliveries are simulated. Authenticated contact-verification codes may appear on screen and never establish live ownership. Password reset is unavailable in this mode; reset codes are never displayed. |
| Hosted payment testing | `PAYMENT_PROVIDER=razorpay` with Razorpay test keys and a matching test webhook. The application uses the real hosted Checkout integration in the provider's test mode. Live Razorpay keys are rejected when demo mode is enabled. |
| Public staging with real email | `DEMO_MODE=false`, HTTPS `APP_ORIGIN`, `PAYMENT_PROVIDER=razorpay`, Razorpay test keys and `ALLOW_PUBLIC_TEST_PAYMENTS=true`. Use real customer sign-in and configured email delivery. Test payments do not collect real money. |
| Live customers | `DEMO_MODE=false`, HTTPS `APP_ORIGIN`, Razorpay live account/keys, configured customer verification, verified business details, and the required operational checks. |

Normal sign-in uses an email address or stored Indian mobile number plus a password. Codes are used for signup verification, authenticated contact verification and **Forgot password**, not ordinary sign-in. Start with SES email verification/recovery and email order updates when minimizing communication spend. Keep SMS disabled until its sender and templates are approved. `TRANSACTIONAL_EMAIL_ENABLED` and `TRANSACTIONAL_SMS_ENABLED` control **order updates**; configured verification/recovery endpoints can send codes independently of those switches.

For the current demonstration project, the AWS SMS account in `ap-south-1` was observed in the sandbox with no registrations or sender IDs on 8 November 2026. SMS recovery and contact verification are implemented and tested with mocked providers, but real SMS delivery is unavailable. No SMS account settings or sender resources have been enabled. The interface offers email recovery when SMS is unavailable. AWS granted SES production access in `ap-south-1` on **8 November 2026**, removing its verified-recipient restriction. The signed-in SES console reconfirmed production access in Asia Pacific (Mumbai) and Healthy status on **9 November 2026**, with a quota of 50,000 emails per day and a sending rate of 14 per second. No domain identities were configured. Signup/recovery email receipt after approval, sender-domain setup and inbox placement still need controlled verification; account status alone does not prove delivery. See [release readiness](RELEASE_READINESS.md) and the [SES approval record](SES_PRODUCTION_ACCESS_REQUEST.md). The public Render database keeps `DEMO_MODE=false`; the project's demonstration purpose does not enable shared demo identities or fake recovery codes there.

Never copy demonstration customer identities into a live customer database. Demo verification leaves `emailVerifiedAt` and `phoneVerifiedAt` unset.

## Configuration

Use the hosting platform's protected runtime settings. `.env.example` lists configuration names and safe defaults; keep credentials out of source control, Docker images, PDFs and shared logs. Supply web and worker processes with the same provider selection and runtime settings.

| Setting | Purpose |
| --- | --- |
| `APP_ORIGIN` | Canonical HTTPS public application URL; also used in order/receipt links. |
| `DEMO_MODE` | Enables the isolated simulation behaviour described above. |
| `ALLOW_PUBLIC_TEST_PAYMENTS` | Explicitly permits public non-demo staging with Razorpay test keys. Defaults to false; rejects live keys while enabled. |
| `PAYMENT_PROVIDER` | `demo` or `razorpay`; an unavailable provider disables payment. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Matching key pair for the selected Razorpay account and mode. Only the public key ID reaches hosted Checkout. |
| `RAZORPAY_WEBHOOK_SECRET` | Signing secret chosen for this application's webhook. |
| `RAZORPAY_PREVIOUS_WEBHOOK_SECRET` | Optional old signing secret during a controlled rotation and provider retry window. |
| `EMAIL_PROVIDER` | `ses` by default; `resend` is optional. |
| `EMAIL_FROM` | Sender identity approved by the chosen email provider. |
| `SMS_PROVIDER` | `aws` by default; `twilio` is optional. |
| `AWS_REGION` | Region containing the configured SES/SMS resources. The AWS SDK receives it explicitly. |
| `TRANSACTIONAL_EMAIL_ENABLED`, `TRANSACTIONAL_SMS_ENABLED` | Set an individual switch to `true` only when that order-update channel is ready. Both default to off. |
| `AWS_SMS_ORIGINATION_IDENTITY` | Registered AWS SMS sender identity or resource accepted by SendTextMessage. |
| `AWS_SMS_ENTITY_ID` | Indian DLT Principal Entity ID for the approved sender/use case. |
| `AWS_SMS_OTP_TEMPLATE_ID`, `AWS_SMS_OTP_TEMPLATE` | Matching DLT template ID and exact approved OTP text, using `{{code}}` for its variable. |
| `AWS_SMS_UPDATE_TEMPLATE_ID`, `AWS_SMS_UPDATE_TEMPLATE` | Matching DLT template ID and approved order-update text. See template rules below. |
| `AWS_SMS_MAX_PRICE_USD` | Per-message maximum sent to AWS; default `0.05`. The application accepts a positive decimal up to `1.00`. This is not a monthly spending cap. |
| `RESEND_API_KEY` | Used only with `EMAIL_PROVIDER=resend`. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Used only with `SMS_PROVIDER=twilio`. |
| `TWILIO_VERIFY_SERVICE_SID` | Twilio Verify service used for phone ownership checks and password recovery. |
| `TWILIO_MESSAGING_SERVICE_SID` | Twilio Messaging Service used for order-update SMS. |
| `PRIVACY_CONTACT`, `SUPPORT_EMAIL` | Real operator contacts displayed in privacy/support flows. |
| `RUN_BACKGROUND_JOBS` | Keep false in the web process when running the separate worker. |

Database, upload storage, HTTPS, worker health and backup settings remain in [launch operations](LAUNCH_OPERATIONS.md).

## Activate Razorpay

For combined hosted-checkout and real-email testing, use a separate staging database with `DEMO_MODE=false`. Configure a public HTTPS `APP_ORIGIN`, real `PRIVACY_CONTACT` and `SUPPORT_EMAIL`, matching Razorpay **test** keys and webhook secret, and `ALLOW_PUBLIC_TEST_PAYMENTS=true`. Then configure SES and verify the test customer's email before creating an order; demo identities and previous order updates do not become verified or get backfilled. When SES is still in the sandbox, the recipient must also be a verified SES identity. `TRANSACTIONAL_EMAIL_ENABLED=true` enables real order updates; keep SMS off unless separately configured. The public startup script announces staging and refuses live keys with this flag. Before accepting real customer payments, disable `ALLOW_PUBLIC_TEST_PAYMENTS`, complete merchant activation and change to the corresponding live keys and webhook configuration.

1. Complete the provider account's business activation before using live keys. Configure and test a separate test-mode integration first.
2. Enable **automatic payment capture** in the Razorpay Dashboard. The application accepts payment only after the provider confirms the matching INR amount, order ID and captured state. An authorization or browser success callback alone does not place a kitchen order. This application does not issue manual capture calls.
3. Set the matching key pair and webhook secret in runtime settings. Configure a public HTTPS webhook at `https://YOUR-APP/api/payments/razorpay/webhook`; replace `YOUR-APP` with the actual application host.
4. Subscribe to `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`, `refund.created`, `refund.processed` and `refund.failed`.
5. Run a test payment through Checkout and confirm the assigned kitchen receives exactly one order. Close Checkout after a payment and test recovery through a verified webhook or the worker. Exercise cancellation and provider-confirmed refund in the test environment.

The webhook verifies the signature over the raw request body and durably stores the canonical payment/refund reference before acknowledging receipt. Provider lookups and settlement run in the worker, outside the provider's acknowledgement deadline. Duplicate events share one inbox record; expired worker leases recover after interruption, and repeated or out-of-order processing does not create additional accepted orders. Apply the gateway-webhook-inbox migration before deploying the new web and worker release. Provider order receipts and durable local records also recover interrupted order creation; the worker reconciles pending payments and periodically checks settled orders.

The payment's test/live mode is persisted. A test payment remains labelled as a **Test order** in live email/SMS notifications even after the application changes to live keys; current configuration cannot turn historical test payments into real ones.

References: [Standard Checkout integration and capture](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/) and [webhook validation, duplicate events and secret rotation](https://razorpay.com/docs/webhooks/validate-test/).

### Refunds and receipts

Cancelling an eligible live order or rejecting a late/invalid captured payment creates a refund request. The customer sees **refund pending** until the provider confirms processing, including when an operator started the refund before the order was cancelled. The worker uses a stable refund idempotency key and reconciles known refunds; a bank can take additional time to show the credit after provider processing. Investigate failed/stuck refunds in the Razorpay Dashboard and the Services queue. An external partial refund requires manual accounting review rather than silently rewriting a full-order receipt.

The order page offers **Download PDF receipt** from the authenticated `/api/orders/[id]/receipt` endpoint. Customer and outlet-scoped staff authorization applies. Receipts display the actual payment/refund state and included GST; no card details or payment credentials are collected or rendered by this app. Live order emails link to the authenticated order page where the PDF can be downloaded. An approved AWS SMS template can include a static application URL/path with `{{orderId}}` as its variable. PDFs are not attached to outbound messages.

## Activate Amazon SES email

1. Select the SES region and verify a sender domain you control. Publish the SES-provided DKIM DNS records and confirm the identity's verification status before setting `EMAIL_FROM`.
2. Choose SES **à la carte** sending for this small application. Dedicated IPs, paid deliverability plans and other optional add-ons are not required by the implementation. Check the provider's current charges, outbound data and any optional features in the selected region.
3. Request SES production access for that region when sending to ordinary customer addresses. In the sandbox, recipients must also be verified or use the SES mailbox simulator. A configured application does not remove sandbox restrictions.
4. Set `EMAIL_PROVIDER=ses`, `AWS_REGION` and `EMAIL_FROM`. Give the runtime access through an appropriately scoped IAM role/default AWS credential chain. On AWS, prefer a workload role; local development may use an authenticated local profile. This repository does not embed AWS credentials or create IAM policies/accounts.
5. After activation, use a consenting test recipient to check signup and password-reset code receipt, expiry and single use, followed by explicit password sign-in. Enable `TRANSACTIONAL_EMAIL_ENABLED` in controlled staging to check a test order update before enabling order email in production. Configure provider-side bounce/complaint monitoring and handle suppressed addresses.

The SESv2 client uses one send attempt per request. An ambiguous network/server failure is not retried automatically because SES SendEmail has no application idempotency token. See the delivery-state table below.

References: [SES DKIM](https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication-dkim.html), [SES production access and sandbox restrictions](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html), [SESv2 SendEmail](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html) and [current SES pricing](https://aws.amazon.com/ses/pricing/).

## Activate AWS SMS for India

The application supports Indian mobile numbers. The AWS adapter deliberately requires a registered sender, Entity ID and matching templates for the local Indian route; it does not invent a sender or approved message text.

1. Complete the applicable DLT sender/use-case/template registration and the AWS sender registration. Check the AWS SMS account's sandbox/production status, destination permissions and spending limits in the chosen region.
2. Provide the actual origination identity and DLT Entity ID. Set separate OTP and order-update template IDs alongside their exact approved static text. Replace only the approved variable positions with the application placeholders below; preserve the approved punctuation and spacing.
3. Keep SMS order updates disabled while completing registration. Once configured, the code-request endpoint can send an OTP, so restrict staging access and test only with a consenting recipient.
4. Confirm the message matches the approved template and reaches the recipient. Then enable `TRANSACTIONAL_SMS_ENABLED` if order-update SMS is needed.

| Template | Accepted application variables |
| --- | --- |
| OTP | Requires `{{code}}`. Other variables are rejected. |
| Order update | Requires `{{orderNumber}}` and either `{{status}}` or `{{message}}`. Optional: `{{orderId}}` and `{{orderUrl}}`. Every substituted value must be at most 30 characters. |

Prefer an approved template using `{{status}}`: the application supplies controlled short labels such as “Order confirmed”, “Ready for pickup”, “Preparation delayed” and “Refund pending”. Ordinary labels are at most 25 characters; test payments add “Test ” and remain within 30 characters. Indian DLT rejects variables longer than 30 characters, so the application rejects an oversized replacement before contacting AWS. `{{message}}` inserts the full generated update and will therefore often exceed the limit; keep detailed updates in email and the order page. A complete `{{orderUrl}}` can also exceed the limit. For links, include the actual domain and `/orders/` path as static approved template text, with `{{orderId}}` as the variable. The local order ID is normally a 25-character CUID, and the same 30-character validation applies to it.

The operator must preserve the approved template's case, punctuation, spacing and character encoding. The application does not certify DLT approval or guarantee a single SMS segment. Unknown placeholders, any substituted value over 30 characters, and rendered bodies over 1,600 characters are rejected.

AWS SendTextMessage receives the DLT Entity/Template IDs, `MessageType=TRANSACTIONAL`, the configured `MaxPrice`, and a 300-second TTL for OTPs. Order-update TTL is 3,600 seconds. OTP codes are randomly generated, hashed at rest, valid for five minutes and consumed once with at most five guesses. They never appear in a live API response or application log.

The cost cap can reject messages whose route/length costs more than the limit. It does not cap aggregate usage, hosting, sender rental or registration charges. Use AWS account-level spending limits and billing controls as well. AWS credit eligibility depends on the user's credit terms, account and services; no free operation or guaranteed credit coverage is claimed.

References: [India sender registration](https://docs.aws.amazon.com/sms-voice/latest/userguide/registrations-sms-senderid-india.html), [DLT matching and 30-character variable limits](https://docs.aws.amazon.com/sms-voice/latest/userguide/registrations-sms-senderid-india-template-issues.html), [SendTextMessage fields, template matching, TTL and MaxPrice](https://docs.aws.amazon.com/pinpoint/latest/apireference_smsvoicev2/API_SendTextMessage.html) and [AWS End User Messaging pricing](https://aws.amazon.com/end-user-messaging/pricing/).

## Optional Resend and Twilio providers

For Resend, select `EMAIL_PROVIDER=resend`, verify the sender/domain, and provide `RESEND_API_KEY` plus `EMAIL_FROM`. Each order email uses a stable idempotency key. Application retries stop within 23 hours, inside Resend's documented 24-hour deduplication window. Changing the destination or selected provider cancels a queued retry.

For Twilio, select `SMS_PROVIDER=twilio` and provide the account credentials. Phone ownership checks and password recovery use the configured **Twilio Verify** service and check the exact verification SID; an SMS send response never proves ownership. Order updates use the separate Messaging Service. Complete destination-country sender/template requirements and account restrictions in Twilio before activation. Ambiguous SMS acceptance is not automatically retried.

References: [Resend send API](https://resend.com/docs/api-reference/emails/send-email), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Twilio Verify checks](https://www.twilio.com/docs/verify/api/verification-check) and [Twilio Messaging Service sends](https://www.twilio.com/docs/messaging/api/message-resource).

## Contact ownership and privacy

Non-demo signup verifies email before creating the account and password. Signup can also capture a normalized, unique Indian mobile number; this enables mobile-number/password login but leaves `phoneVerifiedAt` unset. A signup or checkout phone number is not proof of phone ownership. Customers can verify their phone from `/privacy` after signing in, when an SMS provider is configured. Verification is bound to that signed-in account; an address or number belonging to another account is not merged.

New sessions expire **15 days after creation**, with the same expiry in the HttpOnly cookie and database record. Expired sessions are rejected on the server. Sessions issued before this change retain their stored expiry. Logout, account deletion and password reset revoke sessions before their scheduled expiry.

Forgot password accepts an email address or mobile number and selects that contact's configured channel. `POST /api/auth/password/request` returns a generic challenge response for existing, unknown and unverified contacts; it sends only to a contact that was already verified on the account. Delivery runs after the HTTP response so provider latency does not reveal account existence. An unconfigured channel returns the same explicit unavailable response for all identifiers of that type, and no simulated delivery is claimed.

`POST /api/auth/password/verify` requires the challenge ID, six-digit code and new password. Reset codes are hashed at rest, expire after five minutes, allow at most five guesses and are consumed once. Requests and guesses are rate limited. Resend invalidates the previous challenge; a changed contact, password, account role or deleted account invalidates pending recovery. Success changes the password, revokes all sessions and returns the user to explicit password login. It does not create a session. Staff recovery requires a preverified contact and preserves the staff role; it cannot promote a customer.

The old email/phone code-login endpoints reject ordinary sign-in requests. They remain available only for authenticated customer contact verification; signup uses its separate registration-verification endpoint. First-time verification of a legacy unverified email may invalidate its untrusted password/sessions, after which verified-email password recovery establishes a new password.

Live notifications use verified **account** contacts established before the message was created. A phone number typed into a delivery checkout is not proof of ownership and does not become an SMS destination. Marketing opt-in remains optional; essential order updates are separate from marketing. Verification after an update does not retroactively send that old update.

Account erasure deletes message/outbox records, pending contact/reset challenges and active sessions. Delivery processing locks the customer record so erasure cannot complete while a provider send is in progress. A provider may already have accepted a message before erasure; application deletion cannot retract a sent email/SMS. Account export omits OTP hashes, session tokens, provider credentials and payment retry secrets.

## Worker operations and delivery states

Run the background worker continuously and monitor its heartbeat, queue age, refunds, payment recovery and notification failures. Kitchen maintenance, payment reconciliation and notification delivery run independently so a slow provider cannot block kitchen expiry/late-alert checks. The process heartbeat confirms core order maintenance; provider-specific failures remain visible in the service queues and logs. Each new order message queues its configured channels in the same database transaction. There is no historical-message backfill when a provider is enabled. Demo processes never dispatch a live outbox.

### Diagnose background processing

Apply migrations with `npm run db:migrate` before starting the updated web and worker processes. The `WorkerStatus` table stores a separate report for each process and task, including start/completion/success/failure times and consecutive failures. It contains generic error codes only. Reporting is detached and coalesced so a slow telemetry write does not block the order, payment or notification task. Reports older than seven days are pruned at most hourly by a running worker.

On **Workspace → Services**, refresh the snapshot and check:

- **Background processing:** three independently reported tasks. “Up to date” means a pass completed, including passes with no eligible work; it does not confirm a payment or message outcome. Reports become stale after 90 seconds without activity. A running task is flagged after two minutes for order maintenance, fifteen for payment reconciliation, or five for notifications. These conservative thresholds allow sequential provider batches; they do not terminate jobs or restart a process.
- **Queue timing:** the oldest queued notification is measured from its creation. Refund and payment warnings measure lateness relative to the scheduled check, excluding active leases. Refunds held for manual review or lacking enough provider state for automatic processing are excluded from the overdue refund timer and remain in the review counts.
- **Payment session recovery:** the earliest twenty sessions needing attention include the order link, provider order reference, test/live label, reported problem and next scheduled check. Correct the configuration or reconcile the provider record before expecting recovery. No blind resend or forced payment action is provided.

The page compares currently reporting processes, so a healthy process cannot hide another current process's stalled task. A wholly silent process is indistinguishable from a retired deployment and is omitted once another process is reporting; if none report, the latest process appears stale. Use host monitoring to verify the expected number of worker processes and alert on stopped replicas. This page is a refreshed diagnostic snapshot, not fleet monitoring or an automatic alert service.

| State | Meaning and action |
| --- | --- |
| `SIMULATED` | Demo record; no external message sent. |
| `PENDING` | Waiting for a worker or a bounded retry after a confirmed transient rejection. |
| `IN_FLIGHT` | A worker holds a short lease and is contacting the provider. |
| `ACCEPTED` | Provider API accepted the message. This does **not** prove inbox/device delivery. |
| `SKIPPED` | No eligible verified account contact existed for that message. |
| `CANCELLED` | Provider/channel configuration or recipient changed before dispatch/retry. |
| `FAILED` | Definitive provider/configuration rejection or exhausted retry allowance; investigate configuration and provider records. |
| `UNKNOWN` | Acceptance cannot safely be determined after a timeout, lost response or expired non-idempotent send lease. Review provider records before any manual resend. |

The outbox stores per-channel attempts, an immutable provider, recipient hash, provider message ID when known, and sanitized error codes. Explicit throttling can retry with backoff, up to five attempts. Only Resend can safely recover an uncertain expired email lease using its idempotency key. SES and both SMS adapters require manual review after uncertain acceptance. No automatic action changes `UNKNOWN` back to a sendable state, and the admin page does not provide an unsafe blind-resend button.

Delivery/bounce callbacks are not yet ingested into this application; use provider dashboards/monitoring to confirm delivery and investigate complaints or undeliverable contacts. Do not manually reset an unknown row just because it lacks a provider ID: the original request may have succeeded.

## Verification before live activation

Run `npm run check` and `npm run test:integration` for code and isolated-database verification. Run browser checks against a fresh production build. The tests cover provider request construction, payment signature/money checks, OTP ownership/expiry/attempt limits, account linking, queue concurrency and erasure using mocked providers.

After provider accounts and deployment are configured, separately record a controlled test of payment capture, signed webhook recovery, a processed refund, email/phone verification, order-update acceptance and actual receipt, receipt download, worker interruption and recovery. Real activation needs the appropriate accounts, sender approvals, credentials and a public HTTPS host. Do not label mock results as successful live payment or message delivery.
