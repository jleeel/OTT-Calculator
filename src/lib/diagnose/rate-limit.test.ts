import { describe, expect, it } from "vitest";
import {
  DIAGNOSE_LIMIT,
  WINDOW_MS,
  checkQuota,
  clientIp,
  hashIp,
  rateLimitMessage,
} from "./rate-limit";

const NOW = Date.parse("2025-09-10T12:00:00Z");
const MINUTE = 60_000;

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe("clientIp", () => {
  it("prefers x-real-ip, which the platform sets", () => {
    expect(
      clientIp(
        headers({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "10.0.0.1" }),
      ),
    ).toBe("203.0.113.9");
  });

  it("falls back to the right-most x-forwarded-for entry — the one the nearest proxy appended", () => {
    expect(
      clientIp(headers({ "x-forwarded-for": "203.0.113.9, 70.41.3.18" })),
    ).toBe("70.41.3.18");
  });

  it("ignores a client-chosen left-most entry entirely", () => {
    expect(
      clientIp(
        headers({ "x-forwarded-for": "anything-i-like, 10.1.1.1, 70.41.3.18" }),
      ),
    ).toBe("70.41.3.18");
  });

  it("skips trailing empties in a malformed chain", () => {
    expect(clientIp(headers({ "x-forwarded-for": "70.41.3.18, , " }))).toBe(
      "70.41.3.18",
    );
  });

  it("uses a single bare entry as-is", () => {
    expect(clientIp(headers({ "x-forwarded-for": "70.41.3.18" }))).toBe(
      "70.41.3.18",
    );
  });

  it("returns null when neither header is present", () => {
    expect(clientIp(headers({}))).toBeNull();
  });

  it("returns null rather than an empty string", () => {
    expect(clientIp(headers({ "x-real-ip": "   " }))).toBeNull();
    expect(clientIp(headers({ "x-forwarded-for": " , 70.41.3.18" }))).toBe(
      "70.41.3.18",
    );
  });
});

describe("hashIp", () => {
  it("is stable for the same address and secret", () => {
    expect(hashIp("203.0.113.9", "s")).toBe(hashIp("203.0.113.9", "s"));
  });

  it("separates different addresses", () => {
    expect(hashIp("203.0.113.9", "s")).not.toBe(hashIp("203.0.113.10", "s"));
  });

  it("changes when the secret rotates, resetting the counters", () => {
    expect(hashIp("203.0.113.9", "old")).not.toBe(hashIp("203.0.113.9", "new"));
  });

  it("never contains the address it hashed", () => {
    expect(hashIp("203.0.113.9", "s")).not.toContain("203");
  });
});

describe("checkQuota", () => {
  it("lets a first-time caller through", () => {
    const quota = checkQuota([], NOW);
    expect(quota).toEqual({ ok: true, remaining: DIAGNOSE_LIMIT.max - 1 });
  });

  it("counts down as calls accumulate", () => {
    const quota = checkQuota([NOW - MINUTE, NOW - 2 * MINUTE], NOW);
    expect(quota).toEqual({ ok: true, remaining: DIAGNOSE_LIMIT.max - 3 });
  });

  it("refuses the call past the cap", () => {
    const recent = Array.from(
      { length: DIAGNOSE_LIMIT.max },
      (_, i) => NOW - i * MINUTE,
    );
    const quota = checkQuota(recent, NOW);
    expect(quota.ok).toBe(false);
  });

  it("ignores calls that have aged out of the window", () => {
    const old = Array.from(
      { length: DIAGNOSE_LIMIT.max },
      () => NOW - WINDOW_MS - MINUTE,
    );
    expect(checkQuota(old, NOW).ok).toBe(true);
  });

  it("frees a slot when the oldest in-window call ages out", () => {
    const oldest = NOW - WINDOW_MS + 5 * MINUTE;
    const calls = [
      oldest,
      ...Array.from({ length: DIAGNOSE_LIMIT.max - 1 }, (_, i) => NOW - i * MINUTE),
    ];
    const quota = checkQuota(calls, NOW);
    expect(quota.ok).toBe(false);
    if (!quota.ok) {
      // Five minutes until the oldest leaves the window.
      expect(quota.retryAfterSeconds).toBe(5 * 60);
    }
  });

  it("never reports a retry of zero seconds", () => {
    const boundary = NOW - WINDOW_MS + 1;
    const calls = Array.from({ length: DIAGNOSE_LIMIT.max }, () => boundary);
    const quota = checkQuota(calls, NOW);
    if (!quota.ok) expect(quota.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("discards timestamps that did not parse", () => {
    const calls = [Number.NaN, Number.NaN, NOW - MINUTE];
    const quota = checkQuota(calls, NOW);
    expect(quota).toEqual({ ok: true, remaining: DIAGNOSE_LIMIT.max - 2 });
  });
});

describe("rateLimitMessage", () => {
  it("says how long to wait without scolding", () => {
    expect(rateLimitMessage(300)).toBe(
      `That is ${DIAGNOSE_LIMIT.max} photos in an hour, which is the limit. Try again in 5 minutes.`,
    );
    expect(rateLimitMessage(30)).toMatch(/1 minute\./);
    expect(rateLimitMessage(300)).not.toMatch(/abus|spam|stop|too many/i);
  });
});
