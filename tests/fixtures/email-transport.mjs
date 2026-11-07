import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";

// Only the isolated registration browser process imports this fixture. It tests
// the actual HTTP routes/session flow without sending mail or exposing an OTP API.
const name = process.env.CORE_TEST_DATABASE;
const database = new URL(process.env.DATABASE_URL || "");
const outbox = resolve(".local/registration-outbox", name || "missing");
if (!/^deccan_test_[a-f0-9]+$/.test(name || "") || database.pathname !== `/${name}` ||
    !["localhost", "127.0.0.1"].includes(database.hostname) || database.port !== "55432" ||
    process.env.REGISTRATION_TEST_OUTBOX !== outbox || process.env.EMAIL_PROVIDER !== "resend" ||
    process.env.RESEND_API_KEY !== "registration-browser-fixture" || process.env.DEMO_MODE !== "false")
  throw new Error("Registration email fixture requires the isolated browser test configuration.");
mkdirSync(outbox, { recursive: true, mode: 0o700 });
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.href === "https://api.resend.com/emails") {
    const request = new Request(input, init);
    const message = await request.json();
    const challengeId = request.headers.get("Idempotency-Key")?.replace(/^otp\//, "");
    if (request.method !== "POST" || request.headers.get("Authorization") !== "Bearer registration-browser-fixture" ||
        !/^[a-f0-9-]{36}$/.test(challengeId || "") || !Array.isArray(message.to) || message.to.length !== 1 ||
        !/^[^@]+@customer\.test$/.test(message.to[0]))
      throw new Error("Unexpected registration email fixture request.");
    if (message.to[0].startsWith("unavailable-")) return Response.json({ error: "Fixture transport unavailable" }, { status: 503 });
    writeFileSync(join(outbox, `${challengeId}.json`), JSON.stringify(message), { mode: 0o600 });
    return Response.json({ id: `fixture-${randomUUID()}` });
  }
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    throw new Error("External network request blocked by the registration browser fixture.");
  return originalFetch(input, init);
};
