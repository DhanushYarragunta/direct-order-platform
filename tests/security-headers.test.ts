import { describe, expect, it } from "vitest";
import { securityHeaders } from "../src/lib/security-headers";

describe("security response policy", () => {
  it("requires script nonces and HTTPS transport only for HTTPS origins", () => {
    const policy = securityHeaders("fresh-token", false, true);
    const scripts = policy["Content-Security-Policy"].split(";").find((v) => v.includes("script-src"));
    expect(scripts).toContain("'nonce-fresh-token'");
    expect(scripts).not.toContain("unsafe-inline");
    expect(scripts).not.toContain("unsafe-eval");
    expect(policy["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(policy["Strict-Transport-Security"]).toBe("max-age=31536000");
    expect(securityHeaders("other", false, false)["Strict-Transport-Security"]).toBeUndefined();
    expect(securityHeaders("other", false, false)["Content-Security-Policy"]).not.toContain("upgrade-insecure-requests");
  });
  it("allows debugger eval and sockets only during development", () => {
    expect(securityHeaders("token", true, false)["Content-Security-Policy"]).toContain("'unsafe-eval'");
    expect(securityHeaders("token", true, false)["Content-Security-Policy"]).toContain("ws: wss:");
    expect(securityHeaders("token", false, false)["Content-Security-Policy"]).not.toContain("ws:");
  });
  it("permits the hosted gateway only on explicitly enabled payment responses", () => {
    const payment = securityHeaders("payment-nonce", false, true, true);
    expect(payment["Content-Security-Policy"]).toContain("frame-src https://*.razorpay.com");
    expect(payment["Content-Security-Policy"]).toContain("'nonce-payment-nonce'");
    expect(payment["Content-Security-Policy"]).not.toContain("'unsafe-eval'");
    expect(payment["Permissions-Policy"]).toContain('"https://api.razorpay.com"');
    expect(securityHeaders("ordinary", false, true)["Content-Security-Policy"]).toContain("frame-src 'none'");
  });
});
