const TIMING_KEY = "deccan-checkout-started-v1";
const MAX_DURATION = 24 * 60 * 60_000;

export function checkoutStart(now = Date.now()) {
  try {
    const saved = Number(sessionStorage.getItem(TIMING_KEY));
    if (saved > 0 && saved <= now && now - saved <= MAX_DURATION) return new Date(saved).toISOString();
    sessionStorage.setItem(TIMING_KEY, String(now));
  } catch { /* Storage is optional; checkout still works. */ }
  return new Date(now).toISOString();
}
export function finishCheckoutTiming() {
  try { sessionStorage.removeItem(TIMING_KEY); } catch {}
}

export function validCheckoutStart(value: string | undefined, now = new Date()) {
  if (!value) return null;
  const started = new Date(value);
  const elapsed = now.getTime() - started.getTime();
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= MAX_DURATION ? started : null;
}
