/**
 * IP rate limiting for /diagnose. The pure half: pulling the client address out
 * of proxy headers, hashing it, and deciding whether a set of timestamps is
 * over the limit. The storage half lives in requests.ts.
 *
 * Why by IP and not by cookie, unlike the leaderboard: a cookie limit is a
 * courtesy, and clearing cookies resets it. Every call here costs money, so the
 * limit has to survive someone deciding to be difficult.
 *
 * Why in the database and not in memory: on Vercel each request can land on a
 * different instance, so an in-process counter resets unpredictably. Same
 * reasoning as the leaderboard limiter, different storage.
 */

import { createHmac } from "node:crypto";

export const DIAGNOSE_LIMIT = {
  /** Photos per window. Enough to work a problem, not enough to be a toy. */
  max: 8,
  windowMinutes: 60,
} as const;

export const WINDOW_MS = DIAGNOSE_LIMIT.windowMinutes * 60_000;

/**
 * The caller's address, for the rate limiter's identity.
 *
 * `x-real-ip` is set by the platform and wins where present. The fallback is
 * the RIGHT-most `x-forwarded-for` entry: the chain is whatever the client
 * chose to send plus one address appended by each hop, so the only entry
 * anyone here can vouch for is the last one, appended by the proxy directly in
 * front of us. Taking the left-most entry — "the original client" in the
 * header's optimistic reading — hands anyone a fresh limiter identity per
 * request on any deployment where x-real-ip is absent.
 */
export function clientIp(headers: Headers): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    // Right-most *usable* entry, skipping trailing empties from a malformed
    // chain rather than dropping the caller into the shared null bucket.
    const parts = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }

  return null;
}

/**
 * Addresses are never stored in the clear — the table holds an HMAC. The key is
 * a server-side secret, so the hashes cannot be reversed by anyone who obtains
 * the table, and a rotated secret simply resets the counters.
 */
export function hashIp(ip: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`diagnose:${ip}`)
    .digest("hex")
    .slice(0, 32);
}

export type Quota =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

/**
 * @param timestampsMs when this address's previous calls happened
 * @param nowMs        the current time
 */
export function checkQuota(timestampsMs: number[], nowMs: number): Quota {
  const cutoff = nowMs - WINDOW_MS;
  const inWindow = timestampsMs
    .filter((t) => Number.isFinite(t) && t > cutoff)
    .sort((a, b) => a - b);

  if (inWindow.length < DIAGNOSE_LIMIT.max) {
    return { ok: true, remaining: DIAGNOSE_LIMIT.max - inWindow.length - 1 };
  }

  // A slot frees up when the oldest call in the window ages out.
  const oldest = inWindow[inWindow.length - DIAGNOSE_LIMIT.max];
  const freesAt = oldest + WINDOW_MS;
  return {
    ok: false,
    retryAfterSeconds: Math.max(1, Math.ceil((freesAt - nowMs) / 1000)),
  };
}

/** Wording for a rate-limited grower. Never scolding — they are just early. */
export function rateLimitMessage(retryAfterSeconds: number): string {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return (
    `That is ${DIAGNOSE_LIMIT.max} photos in an hour, which is the limit. ` +
    `Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
  );
}
