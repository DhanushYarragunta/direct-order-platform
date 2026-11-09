# SMS activation

## Account checkpoint — 9 November 2026

AWS account access was restored and the Mumbai (`ap-south-1`) SMS account was checked directly. It remains **SANDBOX**, with a **USD 1 monthly text-message spending limit**, no sender IDs and no registrations. The owner's test destination was verified with an SMS code. A real setup message sent through the application's international adapter using the dedicated Render runtime IAM identity was accepted by AWS, and the owner confirmed handset receipt on 9 November 2026. Sanitized evidence is kept locally in `.local/sms-live-adapter-test.json`.

The runtime IAM user now has the Autopilot-derived `sms-voice:SendTextMessage` permission restricted to `ap-south-1`; its existing SES permission is unchanged. Root credentials were not installed on Render. This successful controlled test does **not** mean arbitrary customer numbers can receive SMS: production approval is still pending.

The website supports phone ownership verification, phone password recovery and order-update SMS. Ordinary login remains email/mobile number plus password. Order updates require a verified account phone number; typing a checkout number does not verify ownership.

## International route for a controlled demo

AWS documents shared international (ILDO) short-code routing for India without registering a branded sender. SMS appears from a shared numeric short code. The application supports this only when explicitly selected; incomplete local registration never triggers an international fallback.

AWS's published price list checked on 9 November 2026 lists India international SMS at **USD 0.071 per segment**, versus **USD 0.004 per segment** locally. Prices can change. Long or Unicode messages can use multiple segments. The per-message application ceiling below is separate from AWS's monthly limit and must be reassessed if pricing changes. Do not assume promotional AWS credits cover SMS.

1. Obtain the consenting tester's Indian number, add it as an AWS verified destination, send its verification code and complete verification using the received code. Sandbox verification is separate from verifying the phone in the website.
2. Grant the Render runtime IAM user only `sms-voice:SendTextMessage` in `ap-south-1`. Preserve its existing SES permission. Shared-route sends have no dedicated sender ARN; use `Resource: "*"` for this action with an `aws:RequestedRegion` condition. Do not deploy root/session credentials or grant registration, IAM-management or spend-limit permissions to the runtime.
3. Keep the existing AWS USD 1 monthly limit. Run AWS `SendTextMessage` with `DryRun=true` to validate the request without delivering or charging for a message. A dry run does not prove delivery.
4. Configure the values below as server-only Render environment variables. Initially leave order updates disabled. Phone verification/recovery can send once the OTP template and route are configured.
5. Request phone verification from the signed-in tester's website account and confirm receipt and successful verification. Then enable order updates and validate a newly created test order with that same consenting account. Do not replay previous notifications or send to unrelated users.
6. Record provider acceptance separately from actual handset receipt. Stop on uncertain acceptance; do not automatically resend.

```dotenv
SMS_PROVIDER=aws
AWS_REGION=ap-south-1
AWS_SMS_ROUTE=international
AWS_SMS_MAX_PRICE_USD=0.08
AWS_SMS_OTP_TEMPLATE="Deccan Kitchen: Your verification code is {{code}}. It expires in 5 minutes. Do not share this code."
AWS_SMS_UPDATE_TEMPLATE="Deccan Kitchen: Order {{orderNumber}} - {{status}}. View details in your account."
TRANSACTIONAL_SMS_ENABLED=false
```

These are proposed application texts for the international route, not approved local DLT templates. Sender identity, Entity ID and DLT template IDs are omitted from international AWS API requests, even if old local values remain in the environment. Required placeholders and the 1,600-character body limit are still validated. Unknown route values disable sending. SES configuration is independent.

## Sending to all customers

The sandbox permits only AWS-verified destinations. Production access is a separate AWS review for each sending region; email production approval does not grant SMS production access. Complete the controlled SMS test before requesting production access. The current USD 1 limit supports only small tests and must not be described as unrestricted customer messaging.

The following support-case draft is prepared for review, **not submitted**. Add truthful completed test evidence and a user-approved monthly usage estimate before submission:

> Request SMS production access for ap-south-1 for https://direct-order-platform.onrender.com, a direct food-ordering demonstration website branded Deccan Kitchen. Destinations are Indian mobile numbers. We plan to use AWS international shared short-code routing initially. Messages are customer-requested phone verification/password-recovery codes and essential order-status updates, with no promotional campaigns. Customers sign in and explicitly request phone verification; entering a checkout number alone does not enable notifications. Ownership codes expire after five minutes, are stored hashed, have limited attempts and request throttling, and cannot be reused. Order messages go only to verified account contacts. Customers can manage or erase their account data. OTP sample: “Deccan Kitchen: Your verification code is 123456. It expires in 5 minutes. Do not share this code.” Order sample: “Deccan Kitchen: Order WEB-123 - Test Order confirmed. View details in your account.” On 9 November 2026 we verified the owner's sandbox destination, passed a SendTextMessage dry run using the dedicated runtime IAM identity, and sent an application-adapter setup test whose handset receipt the owner confirmed. Website account-verification and order-lifecycle handset testing remain separate acceptance checks. Initial usage is a small demonstration limited by the existing USD 1 monthly cap; we are not requesting a spending-limit increase. Please grant SMS Production Access for ap-south-1 (quota value 1).

For lower-cost branded local SMS, complete DLT principal-entity/header/template registration and AWS sender registration, then select `AWS_SMS_ROUTE=local` with actual approved IDs and exact text. See [Live services](LIVE_SERVICES.md#activate-aws-sms-for-india).

Sources: [AWS India routes](https://docs.aws.amazon.com/sms-voice/latest/userguide/registrations-sms-senderid-india-routes.html), [sandbox and production access](https://docs.aws.amazon.com/sms-voice/latest/userguide/sandbox.html), [pricing](https://aws.amazon.com/end-user-messaging/pricing/), [SendTextMessage and dry runs](https://docs.aws.amazon.com/pinpoint/latest/apireference_smsvoicev2/API_SendTextMessage.html), [IAM actions](https://docs.aws.amazon.com/service-authorization/latest/reference/list_pinpoint-sms-voice-v2.html).
