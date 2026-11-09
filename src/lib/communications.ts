import { AppError } from "./auth";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { PinpointSMSVoiceV2Client, SendTextMessageCommand } from "@aws-sdk/client-pinpoint-sms-voice-v2";

const configured = (...keys: string[]) => keys.every((key) => !!process.env[key]?.trim());
export const emailProvider = () => process.env.EMAIL_PROVIDER || "ses";
export const smsProvider = () => process.env.SMS_PROVIDER || "aws";
export const emailConfigured = () => emailProvider() === "ses" ? configured("AWS_REGION", "EMAIL_FROM") : emailProvider() === "resend" && configured("RESEND_API_KEY", "EMAIL_FROM");
// Never fall back to the more expensive international route when local setup is incomplete.
const awsSmsRoute = () => process.env.AWS_SMS_ROUTE || "local";
const awsSmsBase = () => configured("AWS_REGION") && smsMaxPrice() !== null &&
  (awsSmsRoute() === "international" || awsSmsRoute() === "local" && configured("AWS_SMS_ORIGINATION_IDENTITY", "AWS_SMS_ENTITY_ID"));
export const phoneConfigured = () => smsProvider() === "aws" ? awsSmsBase() && templateConfigured("otp") : smsProvider() === "twilio" && configured("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID");
export const smsConfigured = () => smsProvider() === "aws" ? awsSmsBase() && templateConfigured("update") : smsProvider() === "twilio" && configured("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_MESSAGING_SERVICE_SID");
function smsMaxPrice() {
  const value = process.env.AWS_SMS_MAX_PRICE_USD || "0.05";
  return /^\d\.\d{1,5}$/.test(value) && Number(value) > 0 && Number(value) <= 1 ? value : null;
}
function templateConfigured(purpose: "otp" | "update") {
  const prefix = purpose === "otp" ? "AWS_SMS_OTP" : "AWS_SMS_UPDATE";
  const text = process.env[`${prefix}_TEMPLATE`] || "";
  const keys = [...text.matchAll(/\{\{([^{}]+)\}\}/g)].map(match => match[1]);
  const allowed = purpose === "otp" ? ["code"] : ["orderNumber", "orderId", "status", "message", "orderUrl"];
  return (awsSmsRoute() === "international" || configured(`${prefix}_TEMPLATE_ID`)) && text.length <= 1600 && keys.every(key => allowed.includes(key)) &&
    (purpose === "otp" ? keys.includes("code") : keys.includes("orderNumber") && (keys.includes("status") || keys.includes("message"))) &&
    !text.replace(/\{\{([^{}]+)\}\}/g, "").includes("{{");
}
export function renderSmsTemplate(purpose: "otp" | "update", values: Record<string, string>) {
  if (!templateConfigured(purpose)) throw new AppError(503, "The SMS template is not configured.");
  const template = process.env[purpose === "otp" ? "AWS_SMS_OTP_TEMPLATE" : "AWS_SMS_UPDATE_TEMPLATE"]!;
  const text = template.replace(/\{\{([^{}]+)\}\}/g, (_, key: string) => {
    if (!(key in values) || /\{\{|\}\}/.test(values[key])) throw new AppError(503, "The SMS template requires a value.");
    if (awsSmsRoute() !== "international" && values[key].length > 30) throw new AppError(503, "An SMS template value exceeds the 30-character Indian DLT limit.");
    return values[key];
  });
  if (text.length > 1600) throw new AppError(503, "This update exceeds the SMS message limit.");
  return text;
}
export function communicationCapabilities() {
  const demoMode = process.env.DEMO_MODE === "true";
  return {
    demoMode,
    emailProvider: emailProvider(), smsProvider: smsProvider(),
    emailCode: demoMode || emailConfigured(),
    phoneCode: demoMode || phoneConfigured(),
    transactionalEmail: demoMode ? "simulated" : process.env.TRANSACTIONAL_EMAIL_ENABLED === "true" && emailConfigured() ? "configured" : "disabled",
    transactionalSms: demoMode ? "simulated" : process.env.TRANSACTIONAL_SMS_ENABLED === "true" && smsConfigured() ? "configured" : "disabled",
  } as const;
}

// Keep provider response bodies, destinations and credentials out of errors/logs.
export class CommunicationError extends Error {
  constructor(public code: string, public retryable: boolean, public uncertain = false) {
    super("The message provider could not confirm the request.");
  }
}
const emailClients = new Map<string, SESv2Client>(), smsClients = new Map<string, PinpointSMSVoiceV2Client>();
function sesClient() {
  const region = process.env.AWS_REGION!;
  if (!emailClients.has(region)) emailClients.set(region, new SESv2Client({ region, maxAttempts: 1 }));
  return emailClients.get(region)!;
}
function awsSmsClient() {
  const region = process.env.AWS_REGION!;
  if (!smsClients.has(region)) smsClients.set(region, new PinpointSMSVoiceV2Client({ region, maxAttempts: 1 }));
  return smsClients.get(region)!;
}
function awsError(error: unknown): never {
  if (error instanceof CommunicationError) throw error;
  const failure = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  const status = failure?.$metadata?.httpStatusCode;
  if (status === 429 || ["ThrottlingException", "TooManyRequestsException"].includes(failure?.name || ""))
    throw new CommunicationError("AWS_THROTTLED", true);
  if ((status && status < 500) || ["CredentialsProviderError", "InvalidSignatureException", "UnrecognizedClientException"].includes(failure?.name || ""))
    throw new CommunicationError("AWS_REJECTED", false);
  // SES SendEmail and AWS SendTextMessage have no idempotency token. A timeout
  // or server failure may follow acceptance, so never repeat it automatically.
  throw new CommunicationError("AWS_ACCEPTANCE_UNCERTAIN", false, true);
}
async function providerRequest(url: string, init: RequestInit, idempotent: boolean) {
  let response: Response;
  try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(8000), redirect: "error" }); }
  catch { throw new CommunicationError("NETWORK_UNCERTAIN", idempotent, true); }
  if (!response.ok) {
    const uncertain = response.status >= 500;
    await response.body?.cancel().catch(() => {});
    throw new CommunicationError(`HTTP_${response.status}`, response.status === 429 || (idempotent && uncertain), uncertain);
  }
  try {
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Invalid provider response");
    return result as Record<string, unknown>;
  }
  catch { throw new CommunicationError("RESPONSE_UNCERTAIN", idempotent, true); }
}
function liveProvider(ready: boolean) {
  if (process.env.DEMO_MODE === "true" || !ready)
    throw new AppError(503, "This delivery method is not enabled. Please use another sign-in method.");
}
function twilioAuth() {
  return `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`;
}
async function twilioPost(url: string, values: Record<string, string>) {
  return providerRequest(url, { method: "POST", headers: { Authorization: twilioAuth(), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(values) }, false);
}
export async function sendEmail(to: string, subject: string, text: string, key: string) {
  liveProvider(emailConfigured());
  if (emailProvider() === "ses") {
    try {
      const result = await sesClient().send(new SendEmailCommand({
        FromEmailAddress: process.env.EMAIL_FROM, Destination: { ToAddresses: [to] },
        Content: { Simple: { Subject: { Data: subject, Charset: "UTF-8" }, Body: { Text: { Data: text, Charset: "UTF-8" } } } },
      }), { abortSignal: AbortSignal.timeout(8000) });
      if (!result.MessageId) throw new CommunicationError("AWS_ACCEPTANCE_UNCERTAIN", false, true);
      return result.MessageId;
    } catch (error) { return awsError(error); }
  }
  const result = await providerRequest("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text }),
  }, true);
  if (typeof result.id !== "string" || !result.id) throw new CommunicationError("RESPONSE_UNCERTAIN", true, true);
  return result.id;
}
export async function startPhoneVerification(phone: string) {
  liveProvider(smsProvider() === "twilio" && phoneConfigured());
  const result = await twilioPost(`https://verify.twilio.com/v2/Services/${encodeURIComponent(process.env.TWILIO_VERIFY_SERVICE_SID!)}/Verifications`, { To: `+91${phone}`, Channel: "sms" });
  if (typeof result.sid !== "string" || !/^VE[a-zA-Z0-9]{32}$/.test(result.sid)) throw new CommunicationError("RESPONSE_UNCERTAIN", false, true);
  return result.sid;
}
export async function checkPhoneVerification(providerId: string, code: string) {
  liveProvider(smsProvider() === "twilio" && phoneConfigured());
  try {
    const result = await twilioPost(`https://verify.twilio.com/v2/Services/${encodeURIComponent(process.env.TWILIO_VERIFY_SERVICE_SID!)}/VerificationCheck`, { VerificationSid: providerId, Code: code });
    return result.status === "approved" && result.valid === true;
  } catch (error) {
    if (error instanceof CommunicationError && ["HTTP_404", "HTTP_400"].includes(error.code)) return false;
    throw error;
  }
}
type SmsContext = { purpose: "otp"; code: string } | { purpose: "update"; orderNumber: string; orderId: string; status: string; message: string; orderUrl: string };
export async function sendSms(phone: string, text: string, context?: SmsContext) {
  liveProvider(context?.purpose === "otp" ? phoneConfigured() : smsConfigured());
  if (smsProvider() === "aws") {
    if (!context) throw new AppError(503, "The SMS template is required.");
    const body = context.purpose === "otp" ? renderSmsTemplate("otp", { code: context.code })
      : renderSmsTemplate("update", { orderNumber: context.orderNumber, orderId: context.orderId, status: context.status, message: context.message, orderUrl: context.orderUrl });
    try {
      const result = await awsSmsClient().send(new SendTextMessageCommand({
        DestinationPhoneNumber: `+91${phone}`,
        ...(awsSmsRoute() === "local" ? {
          OriginationIdentity: process.env.AWS_SMS_ORIGINATION_IDENTITY,
          DestinationCountryParameters: { IN_ENTITY_ID: process.env.AWS_SMS_ENTITY_ID!, IN_TEMPLATE_ID: process.env[context.purpose === "otp" ? "AWS_SMS_OTP_TEMPLATE_ID" : "AWS_SMS_UPDATE_TEMPLATE_ID"]! },
        } : {}),
        MessageBody: body, MessageType: "TRANSACTIONAL", MaxPrice: smsMaxPrice()!, TimeToLive: context.purpose === "otp" ? 300 : 3600,
      }), { abortSignal: AbortSignal.timeout(8000) });
      if (!result.MessageId) throw new CommunicationError("AWS_ACCEPTANCE_UNCERTAIN", false, true);
      return result.MessageId;
    } catch (error) { return awsError(error); }
  }
  const result = await twilioPost(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(process.env.TWILIO_ACCOUNT_SID!)}/Messages.json`, {
    To: `+91${phone}`, MessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID!, Body: text,
  });
  if (typeof result.sid !== "string" || !/^[SM][M][a-zA-Z0-9]{32}$/.test(result.sid)) throw new CommunicationError("RESPONSE_UNCERTAIN", false, true);
  return result.sid;
}
