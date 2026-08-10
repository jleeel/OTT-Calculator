import "server-only";

import { createHmac, createHash, timingSafeEqual } from "node:crypto";

/**
 * Ownership of a leaderboard entry, held as a signed httpOnly cookie keyed by
 * entry id. The browser that created an entry can remove it; nobody else can.
 *
 * The token itself is the row's edit_token, which anon can never read back from
 * the database — so possession of the cookie is the whole proof.
 */

export const OWNER_COOKIE_PREFIX = "ott_entry_";
export const OWNER_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

export function ownerCookieName(entryId: string): string {
  // Entry ids are uuids from the database, so this is already cookie-safe.
  return `${OWNER_COOKIE_PREFIX}${entryId}`;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

export function signOwnership(editToken: string, secret: string): string {
  return `${editToken}.${sign(editToken, secret)}`;
}

/** Returns the edit token, or null if the cookie was not signed by this secret. */
export function verifyOwnership(
  cookieValue: string | undefined,
  secret: string,
): string | null {
  if (!cookieValue) return null;
  const split = cookieValue.lastIndexOf(".");
  if (split <= 0) return null;

  const token = cookieValue.slice(0, split);
  const signature = cookieValue.slice(split + 1);
  if (!safeEqual(signature, sign(token, secret))) return null;
  return token;
}

/** The admin passcode, used to gate deletion of anything. */
export function requireAdminPasscode(): string {
  const value = process.env.ADMIN_PASSCODE?.trim();
  if (!value) {
    throw new Error(
      "Missing required environment variable: ADMIN_PASSCODE. " +
        "Set it in .env.local or under Project Settings -> Environment Variables.",
    );
  }
  return value;
}
