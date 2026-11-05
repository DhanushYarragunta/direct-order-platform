export function securityHeaders(nonce: string, development: boolean, https: boolean) {
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
      // React style attributes and chart layouts require inline styles. Scripts do not.
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data:",
      "font-src 'self'",
      `connect-src 'self'${development ? " ws: wss:" : ""}`,
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
    "Permissions-Policy": "camera=(), microphone=(), payment=(), geolocation=(self), screen-wake-lock=(self)",
    ...(https ? { "Strict-Transport-Security": "max-age=31536000" } : {}),
  };
}
