import { describe, expect, it } from "vitest";
import { SupabaseUrlError, normalizeSupabaseUrl } from "./url";

const GOOD = "https://zegsvajavoyhnivrflaf.supabase.co";

describe("normalizeSupabaseUrl", () => {
  it("passes a correct project URL through unchanged", () => {
    expect(normalizeSupabaseUrl(GOOD)).toBe(GOOD);
  });

  it("strips a trailing slash", () => {
    // supabase-js appends "/rest/v1/...", so this produced a double slash and
    // the host answered "Invalid path specified in request URL".
    expect(normalizeSupabaseUrl(`${GOOD}/`)).toBe(GOOD);
    expect(normalizeSupabaseUrl(`${GOOD}///`)).toBe(GOOD);
  });

  it("strips surrounding whitespace, which pasting adds", () => {
    expect(normalizeSupabaseUrl(`  ${GOOD}  `)).toBe(GOOD);
  });

  it("strips an API path the client appends itself", () => {
    expect(normalizeSupabaseUrl(`${GOOD}/rest/v1`)).toBe(GOOD);
    expect(normalizeSupabaseUrl(`${GOOD}/rest/v1/`)).toBe(GOOD);
    expect(normalizeSupabaseUrl(`${GOOD}/auth/v1`)).toBe(GOOD);
    expect(normalizeSupabaseUrl(`${GOOD}/storage/v1`)).toBe(GOOD);
  });

  it("rejects the dashboard URL, which is the easiest paste to get wrong", () => {
    expect(() =>
      normalizeSupabaseUrl("https://supabase.com/dashboard/project/zegsvajavoyhnivrflaf"),
    ).toThrow(SupabaseUrlError);
  });

  it("names the variable in every error, so the log says what to fix", () => {
    for (const bad of [
      "",
      "   ",
      "not a url",
      "http://zegsvajavoyhnivrflaf.supabase.co",
      "https://supabase.com/dashboard/project/abc",
      `${GOOD}/rest/v2`,
    ]) {
      expect(() => normalizeSupabaseUrl(bad)).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    }
  });

  it("quotes the offending value back, so the log shows what was set", () => {
    expect(() => normalizeSupabaseUrl("https://supabase.com/dashboard/project/abc")).toThrow(
      /Got: https:\/\/supabase\.com\/dashboard\/project\/abc/,
    );
  });

  it("rejects an unexpected path rather than guessing at it", () => {
    expect(() => normalizeSupabaseUrl(`${GOOD}/leaderboard`)).toThrow(
      /unexpected path \("\/leaderboard"\)/,
    );
  });

  it("requires https, since the keys travel in the headers", () => {
    expect(() => normalizeSupabaseUrl("http://zegsvajavoyhnivrflaf.supabase.co")).toThrow(
      /must use https/,
    );
  });

  it("still allows a local stack over http", () => {
    expect(normalizeSupabaseUrl("http://localhost:54321")).toBe("http://localhost:54321");
  });
});
