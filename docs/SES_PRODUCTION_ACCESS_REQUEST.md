# SES production access request — approved

## Verified approval

After submission, a read-only AWS account check on **8 November 2026** returned `ProductionAccessEnabled=true`, `SendingEnabled=true`, `EnforcementStatus=HEALTHY` and review status **`GRANTED`** in `ap-south-1`.

The signed-in SES console reconfirmed **“You are in Production — Asia Pacific (Mumbai) region”** and **Healthy** on **9 November**. The console shows **50,000 emails per 24 hours**, a maximum rate of **14 emails/second**, and no domain identities. Signup recipients no longer need to be separately verified in SES; the application still verifies their email ownership by code. Approval does not establish inbox delivery: actual signup/recovery receipt after approval, sending-domain setup and inbox placement remain to be checked.

## Initial restriction — before approval

Before submission on 8 November, read-only AWS checks returned `ProductionAccessEnabled=false`, `SendingEnabled=true` and `EnforcementStatus=HEALTHY`. The daily quota was 200, at one message per second. Only the owner's existing email identity was verified, with no domain identity configured. Bounce and complaint suppression were enabled.

The Render application's `/api/health` returned HTTP 200 with a reachable database. `/api/auth/methods` confirmed non-demo authentication, SES email and disabled SMS. The then-active SES sandbox restriction prevented signup codes from reaching unverified recipients. Existing-account password sign-in did not require an email code.

## Submitted request

The owner approved the exact request below on **8 November 2026**, and it was submitted using `sesv2 put-account-details` in `ap-south-1`. The immediate account read returned review status **`PENDING`**, with `ProductionAccessEnabled=false` and `SendingEnabled=true`; the later **`GRANTED`** result above supersedes that state. The request sought removal of the recipient restriction with the existing sending limits; AWS's approved quotas are recorded above. The submitted use-case text is preserved unchanged.

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

## Historical fallback while approval was pending

Before approval, the owner could authorize verification emails to named tester addresses, which then had to follow AWS's verification link before signup could deliver a code. That restricted-testing fallback is no longer required in the approved Mumbai account. Existing judges' management credentials support password sign-in without email OTP. Application email verification remains required; contacts must not be marked verified merely to bypass delivery problems.
