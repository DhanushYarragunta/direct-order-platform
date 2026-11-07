export function securityHeaders(nonce: string, development: boolean, https: boolean, gateway = false) {
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
      // React style attributes and chart layouts require inline styles. Scripts do not.
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' blob: data:${gateway ? " https://*.razorpay.com" : ""}`,
      "font-src 'self'",
      `connect-src 'self'${gateway ? " https://*.razorpay.com" : ""}${development ? " ws: wss:" : ""}`,
      `frame-src ${gateway ? "https://*.razorpay.com" : "'none'"}`,
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      ...(https ? ["upgrade-insecure-requests"] : []),
    ].join("; "),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": `camera=(), microphone=(), payment=${gateway ? '(self "https://api.razorpay.com" "https://checkout.razorpay.com")' : "()"}, geolocation=(self), screen-wake-lock=(self)`,
    ...(https ? { "Strict-Transport-Security": "max-age=31536000" } : {}),
  };
}
