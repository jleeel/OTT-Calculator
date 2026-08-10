import { describe, expect, it } from "vitest";
import {
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  SESSION_MAX_AGE_SECONDS,
  newSession,
  passcodeMatches,
  recordInsert,
  signSession,
  verifySession,
} from "./session";

const SECRET = "correct-horse-battery-staple";
const NOW = 1_757_900_000_000;

describe("passcodeMatches", () => {
  it("accepts the configured passcode", () => {
    expect(passcodeMatches("pumpkins2025", "pumpkins2025")).toBe(true);
  });

  it("rejects a wrong passcode, including near misses", () => {
    expect(passcodeMatches("pumpkins2024", "pumpkins2025")).toBe(false);
    expect(passcodeMatches("pumpkins2025 ", "pumpkins2025")).toBe(false);
    expect(passcodeMatches("PUMPKINS2025", "pumpkins2025")).toBe(false);
  });

  it("rejects an empty submission without comparing", () => {
    expect(passcodeMatches("", "pumpkins2025")).toBe(false);
  });

  it("handles differing lengths without throwing", () => {
    expect(passcodeMatches("a", "a-much-longer-passcode")).toBe(false);
  });
});

describe("signSession / verifySession", () => {
  it("round-trips a session", () => {
    const session = newSession(NOW);
    const verified = verifySession(signSession(session, SECRET), SECRET, NOW);
    expect(verified).not.toBeNull();
    expect(verified?.id).toBe(session.id);
    expect(verified?.iat).toBe(NOW);
    expect(verified?.inserts).toEqual([]);
  });

  it("preserves the insert history", () => {
    const session = { ...newSession(NOW), inserts: [NOW - 100, NOW - 50] };
    const verified = verifySession(signSession(session, SECRET), SECRET, NOW);
    expect(verified?.inserts).toEqual([NOW - 100, NOW - 50]);
  });

  it("rejects a token signed with a different passcode", () => {
    const token = signSession(newSession(NOW), SECRET);
    expect(verifySession(token, "some-other-passcode", NOW)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const token = signSession(newSession(NOW), SECRET);
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ id: "forged", iat: NOW, inserts: [] }),
    ).toString("base64url");
    expect(verifySession(`${forged}.${signature}`, SECRET, NOW)).toBeNull();
    expect(payload).not.toBe(forged);
  });

  it("rejects an attempt to clear the rate-limit counter", () => {
    const spent = {
      ...newSession(NOW),
      inserts: Array.from({ length: RATE_LIMIT_MAX }, (_, i) => NOW - i * 1000),
    };
    const token = signSession(spent, SECRET);
    const signature = token.slice(token.lastIndexOf(".") + 1);
    const cleared = Buffer.from(
      JSON.stringify({ ...spent, inserts: [] }),
    ).toString("base64url");
    expect(verifySession(`${cleared}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it.each([undefined, "", "not-a-token", "onlyonepart", ".", "a.b.c"])(
    "rejects malformed token %s",
    (token) => {
      expect(verifySession(token, SECRET, NOW)).toBeNull();
    },
  );

  it("rejects a session past its max age", () => {
    const token = signSession(newSession(NOW), SECRET);
    const justInside = NOW + SESSION_MAX_AGE_SECONDS * 1000;
    expect(verifySession(token, SECRET, justInside)).not.toBeNull();
    expect(verifySession(token, SECRET, justInside + 1)).toBeNull();
  });
});

describe("recordInsert", () => {
  it("allows up to the limit within the window", () => {
    let session = newSession(NOW);
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      const result = recordInsert(session, NOW + i * 1000);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      session = result.session;
    }
    expect(session.inserts).toHaveLength(RATE_LIMIT_MAX);
  });

  it("refuses the one past the limit and says how long to wait", () => {
    const session = {
      ...newSession(NOW),
      inserts: Array.from({ length: RATE_LIMIT_MAX }, () => NOW),
    };
    const result = recordInsert(session, NOW + 60_000);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // One minute used out of the hour window.
    expect(result.retryAfterSeconds).toBe(3540);
  });

  it("lets the oldest insert age out of the window", () => {
    const session = {
      ...newSession(NOW),
      inserts: Array.from({ length: RATE_LIMIT_MAX }, (_, i) => NOW + i),
    };
    const blocked = recordInsert(session, NOW + RATE_LIMIT_WINDOW_MS - 1);
    expect(blocked.ok).toBe(false);

    const allowed = recordInsert(session, NOW + RATE_LIMIT_WINDOW_MS + 1);
    expect(allowed.ok).toBe(true);
    if (!allowed.ok) return;
    // The expired timestamps are pruned rather than accumulating forever.
    expect(allowed.session.inserts.length).toBeLessThanOrEqual(RATE_LIMIT_MAX);
  });

  it("does not mutate the session it was given", () => {
    const session = newSession(NOW);
    recordInsert(session, NOW);
    expect(session.inserts).toEqual([]);
  });
});
