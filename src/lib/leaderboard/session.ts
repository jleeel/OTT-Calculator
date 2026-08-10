import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Passcode gate for leaderboard writes.
 *
 * Reading the board needs nothing. Entering it needs the patch passcode, which
 * is exchanged once for a signed httpOnly cookie.
 *
 * The rate-limit counter rides inside that signed cookie rather than in server
 * memory. On Vercel each request may hit a different instance, so an in-process
 * Map would reset unpredictably; the cookie travels with the client and cannot
 * be edited without the signing key. The tradeoff is that clearing cookies
 * resets the count — but that also throws away the session, so the passcode has
 * to be entered again.
 */

export const SESSION_COOKIE = "ott_leaderboard_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const RATE_LIMIT_MAX = 5;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export type Session = {
  /** Random per-session id. Not a user identity — only useful for debugging. */
  id: string;
  /** Issued at, epoch ms. */
  iat: number;
  /** Epoch ms of recent inserts, pruned to the rate-limit window. */
  inserts: number[];
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Constant-time compare of two arbitrary-length strings. */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/** Compare a submitted passcode against the configured one, without leaking timing. */
export function passcodeMatches(submitted: string, expected: string): boolean {
  if (typeof submitted !== "string" || submitted.length === 0) return false;
  return safeEqual(submitted, expected);
}

export function newSession(now: number): Session {
  return { id: randomUUID(), iat: now, inserts: [] };
}

export function signSession(session: Session, secret: string): string {
  const payload = base64url(JSON.stringify(session));
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * Parse and authenticate a session cookie. Returns null for anything not
 * signed by this secret, malformed, or past its max age — the caller treats
 * all of those the same way: ask for the passcode again.
 */
export function verifySession(
  token: string | undefined,
  secret: string,
  now: number,
): Session | null {
  if (!token) return null;

  const split = token.lastIndexOf(".");
  if (split <= 0) return null;

  const payload = token.slice(0, split);
  const signature = token.slice(split + 1);
  if (!safeEqual(signature, sign(payload, secret))) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const { id, iat, inserts } = parsed as Record<string, unknown>;
  if (typeof id !== "string" || typeof iat !== "number") return null;

  if (now - iat > SESSION_MAX_AGE_SECONDS * 1000) return null;

  return {
    id,
    iat,
    inserts: Array.isArray(inserts)
      ? inserts.filter((t): t is number => typeof t === "number")
      : [],
  };
}

export type RateLimitResult =
  | { ok: true; session: Session }
  | { ok: false; retryAfterSeconds: number };

/**
 * Record an insert against the session's rolling hour, or refuse it.
 * Returns the session to re-sign into the response cookie on success.
 */
export function recordInsert(session: Session, now: number): RateLimitResult {
  const recent = session.inserts.filter((at) => now - at < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX) {
    const oldest = Math.min(...recent);
    const waitMs = RATE_LIMIT_WINDOW_MS - (now - oldest);
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) };
  }

  return { ok: true, session: { ...session, inserts: [...recent, now] } };
}

/**
 * The configured passcode, which also keys the cookie signature — so changing
 * the passcode invalidates every outstanding session, which is what you want.
 */
export function requirePasscode(): string {
  const value = process.env.LEADERBOARD_PASSCODE?.trim();
  if (!value) {
    throw new Error(
      "Missing required environment variable: LEADERBOARD_PASSCODE. " +
        "Set it in .env.local (local) or under Project Settings -> Environment " +
        "Variables (Vercel). Generate one with: openssl rand -base64 32",
    );
  }
  return value;
}
