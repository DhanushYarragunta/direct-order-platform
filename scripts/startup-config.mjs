/** Validate deployment settings without exposing credentials or starting a server. */
export function validateStartupConfig(env = process.env) {
  if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is required");
  let origin;
  try { origin = new URL(env.APP_ORIGIN || ""); }
  catch { throw new Error("APP_ORIGIN must be an absolute URL"); }
  if (origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password)
    throw new Error("APP_ORIGIN must contain only a scheme, hostname and optional port");
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname);
  const demo = env.DEMO_MODE === "true";
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && loopback))
    throw new Error("Public deployments require an HTTPS APP_ORIGIN");
  if (!loopback && demo && env.ALLOW_PUBLIC_DEMO !== "true")
    throw new Error("Set ALLOW_PUBLIC_DEMO=true to explicitly publish a demo with shared accounts and simulated phone codes");

  const keyMode = /^rzp_(test|live)_[A-Za-z0-9_]+$/.exec(env.RAZORPAY_KEY_ID || "")?.[1];
  const allowPublicTestPayments = env.ALLOW_PUBLIC_TEST_PAYMENTS === "true";
  if (demo && env.PAYMENT_PROVIDER === "razorpay" && env.RAZORPAY_KEY_ID?.startsWith("rzp_live_"))
    throw new Error("Live payment keys cannot be used with shared demo accounts");
  if (!demo && allowPublicTestPayments && (env.PAYMENT_PROVIDER !== "razorpay" || keyMode !== "test"))
    throw new Error("ALLOW_PUBLIC_TEST_PAYMENTS requires Razorpay test keys; disable it before enabling live checkout");

  if (!loopback && !demo) {
    if (!env.PRIVACY_CONTACT?.trim())
      throw new Error("Set the business PRIVACY_CONTACT before accepting public customer data");
    if (env.PAYMENT_PROVIDER !== "razorpay" || !keyMode || !env.RAZORPAY_KEY_SECRET?.trim() || !env.RAZORPAY_WEBHOOK_SECRET?.trim())
      throw new Error("Configure Razorpay keys and webhook verification before enabling public customer checkout");
    if (keyMode === "test" && !allowPublicTestPayments)
      throw new Error("Set ALLOW_PUBLIC_TEST_PAYMENTS=true for public staging; Razorpay test payments do not collect real money");
    if (!env.SUPPORT_EMAIL?.trim()) throw new Error("Configure SUPPORT_EMAIL for order/payment support");
  }
  return { origin: origin.origin, publicTestPayments: !loopback && !demo && keyMode === "test" };
}
