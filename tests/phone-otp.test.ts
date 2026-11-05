import { describe, expect, it } from "vitest";
import { otpRequestSchema, otpVerifySchema } from "../src/lib/phone-otp";

describe("phone sign-in input validation", () => {
  it("requires explicit essential consent and leaves marketing off by default", () => {
    const input = { phone: "9000000000", name: "Test customer", consent: true };
    expect(otpRequestSchema.parse(input).marketingOptIn).toBe(false);
    expect(otpRequestSchema.safeParse({ ...input, consent: false }).success).toBe(false);
    expect(otpRequestSchema.safeParse({ phone: input.phone, name: input.name }).success).toBe(false);
    expect(otpRequestSchema.safeParse({ ...input, role: "ADMIN" }).success).toBe(false);
  });
  it("accepts only Indian mobile numbers and a bound six-digit verification code", () => {
    expect(otpRequestSchema.safeParse({ phone: "1234567890", name: "Test customer", consent: true }).success).toBe(false);
    expect(otpVerifySchema.safeParse({ challengeId: "not-a-challenge", code: "123456" }).success).toBe(false);
    expect(otpVerifySchema.safeParse({ challengeId: "6415fc27-188c-468b-8d7e-2fef6a726a19", code: "12345" }).success).toBe(false);
  });
});
