# SES production access request — submitted, pending AWS review

## Verified status on 8 November 2026

Read-only AWS checks in `ap-south-1` returned `ProductionAccessEnabled=false`, `SendingEnabled=true` and `EnforcementStatus=HEALTHY`. The daily sending quota is 200 and the sending rate is one message per second. Only the owner's existing email identity is verified; no domain identity is configured. Bounce and complaint suppression are enabled.

The Render application's `/api/health` returned HTTP 200 with a reachable database. `/api/auth/methods` confirms non-demo authentication, SES email and disabled SMS. SES sandbox restrictions prevent signup codes from reaching unverified recipients. Password sign-in for existing accounts does not require an email code.

## Submitted request

The owner approved this exact request on **8 November 2026**, and it was submitted using `sesv2 put-account-details` in `ap-south-1`. The subsequent account read returned review status **`PENDING`**, with `ProductionAccessEnabled=false` and `SendingEnabled=true`. This requests removal of the recipient restriction, not an increase in quota. Approval and timing are controlled by AWS; ordinary unverified recipients remain blocked while review is pending.

- Region: `ap-south-1`
- Mail type: `TRANSACTIONAL`
- Website: <https://direct-order-platform.onrender.com>
- Contact language: `EN`
- Production access requested: `true`

### Use-case description

Deccan Kitchen & Co. is a restaurant-ordering demonstration project used for testing and assessment. The website currently uses Razorpay test payments and is not accepting real-money orders. We request SES production access in ap-south-1 so people testing the application can receive email verification and password-recovery codes without first being added as SES verified identities.

Emails are triggered by users entering an address to register or recover an existing account, or by status changes to orders belonging to users with a verified email contact. Verification codes expire after five minutes and have limited attempts. Registration verifies email ownership before creating an account. Password recovery only sends to an existing verified account contact and is rate limited. Registration requests are limited to five per address and 200 globally per ten-minute window; password-recovery requests are limited to four per contact and 100 globally per ten-minute window. The application also supports transactional order confirmations and preparation/refund updates.

We do not use purchased address lists or send bulk marketing campaigns. An optional marketing-consent preference is stored separately, but no marketing campaign sender is connected. The current sender is an individually verified email address, not a verified custom domain. Feedback forwarding and account suppression for both bounces and complaints are enabled. Provider responses are sanitized by the application. The current application does not implement automated bounce/complaint event ingestion. The website includes privacy and support pages, account-data export and customer-account deletion.

We request access for this low-volume test use case with the existing sending limits. We understand that AWS may require additional sender-domain or operational information before approving access.

## If access is needed before approval

The owner can authorize verification emails to named tester addresses. Each recipient must follow AWS's verification link before signup can deliver a code. This remains restricted testing, not public signup. Existing judges' management credentials already support password sign-in without email OTP. Do not disable application email verification or mark contacts verified merely to bypass SES restrictions.
