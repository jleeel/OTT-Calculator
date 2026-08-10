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
 * The caller's address, from the proxy headers Vercel sets.
 *
 * `x-forwarded-for` is a chain: the left-most entry is the original client and
 * everything after it is a hop. Vercel appends the real peer address, so the
 * left-most value is client-controlled and cannot be trusted on its own —
 * `x-real-ip`, which the platform sets, is preferred where present.
 */
export function clientIp(headers: Headers): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    // Left-most *usable* entry. A malformed chain with an empty leading element
    // should fall through to the next hop rather than drop the caller into the
    // shared unknown bucket with everyone else behind a bare proxy.
    const first = forwarded
      .split(",")
      .map((part) => part.trim())
      .find(Boolean);
    if (first) return first;
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
