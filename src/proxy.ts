import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { securityHeaders } from "./lib/security-headers";

export function proxy(request: NextRequest) {
  const nonce = randomBytes(24).toString("base64");
  const values = securityHeaders(nonce, process.env.NODE_ENV === "development",
    process.env.APP_ORIGIN?.startsWith("https://") === true);
  const forwarded = new Headers(request.headers);
  forwarded.set("x-nonce", nonce);
  forwarded.set("Content-Security-Policy", values["Content-Security-Policy"]);
  const response = NextResponse.next({ request: { headers: forwarded } });
  for (const [key, value] of Object.entries(values)) response.headers.set(key, value);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|food/|icons/).*)"],
};
