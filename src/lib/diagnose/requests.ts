import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  DIAGNOSE_LIMIT,
  WINDOW_MS,
  checkQuota,
  hashIp,
  type Quota,
} from "./rate-limit";

/**
 * The storage half of the /diagnose rate limit.
 *
 * The service role key is used because anon has no rights on this table at all
 * — see migration 0005. Nothing in the browser touches it.
 */

/**
 * HMAC key for the address hash.
 *
 * The service role key doubles as the secret rather than adding an env var
 * nobody would remember to set. It is server-only, guaranteed present (the
 * startup guard in supabase/server.ts requires it), and rotating it just resets
 * the counters. It is never sent anywhere — only the digest is stored.
 */
function ipSecret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  return key;
}

/**
 * Check the caller's quota and, if there is room, record this call.
 *
 * Recorded *before* the model call, not after: a request that reaches Anthropic
 * and then times out has still cost money, so it has to count. The trade is
 * that a photo rejected by validation never gets here, which is right — those
 * cost nothing.
 *
 * The claim itself happens in Postgres (migration 0006) under a per-address
 * advisory lock, because a check here followed by an insert is two round trips
 * — a burst of parallel requests could all pass the check before any insert
 * landed. The function returns the in-window timestamps from before the claim;
 * the quota rule and retry-after maths stay in checkQuota, so the SQL and the
 * JS cannot disagree about the window. When the verdict is ok, the row has
 * already been recorded, atomically.
 */
export async function claimDiagnoseSlot(
  ip: string,
  nowMs: number,
): Promise<Quota> {
  const supabase = createServiceRoleClient();
  const hash = hashIp(ip, ipSecret());

  const { data, error } = await supabase.rpc("claim_diagnose_slot", {
    p_ip_hash: hash,
    p_now: new Date(nowMs).toISOString(),
    p_window_seconds: Math.round(WINDOW_MS / 1000),
    p_max: DIAGNOSE_LIMIT.max,
  });

  if (error) {
    // 42883: function does not exist; PGRST202: PostgREST has no such function
    // in its schema cache. Both mean migration 0006 has not been applied yet.
    // Fall back to the old two-step claim so the route keeps working — it is
    // the racy path the RPC replaces, not worse than before — and say so.
    if (error.code === "PGRST202" || error.code === "42883") {
      console.warn(
        "[diagnose] claim_diagnose_slot missing — apply migration 0006 for an atomic claim; using the non-atomic fallback",
      );
      return legacyClaimDiagnoseSlot(supabase, hash, nowMs);
    }
    throw error;
  }

  const stamps = (Array.isArray(data) ? data : []).map((t) =>
    Date.parse(String(t)),
  );
  return checkQuota(stamps, nowMs);
}

/** The pre-0006 two-step claim. Only reached while the RPC is missing. */
async function legacyClaimDiagnoseSlot(
  supabase: ReturnType<typeof createServiceRoleClient>,
  hash: string,
  nowMs: number,
): Promise<Quota> {
  const since = new Date(nowMs - WINDOW_MS).toISOString();

  const { data, error } = await supabase
    .from("diagnose_requests")
    .select("created_at")
    .eq("ip_hash", hash)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(DIAGNOSE_LIMIT.max);

  if (error) throw error;

  const quota = checkQuota(
    (data ?? []).map((row) => Date.parse(row.created_at as string)),
    nowMs,
  );
  if (!quota.ok) return quota;

  const { error: insertError } = await supabase
    .from("diagnose_requests")
    .insert({ ip_hash: hash, created_at: new Date(nowMs).toISOString() });

  if (insertError) throw insertError;

  return quota;
}

/**
 * Drop rows that have aged out of every window. Housekeeping only — the count
 * query is already bounded by `created_at`, so a failure here changes nothing
 * about correctness and is deliberately swallowed.
 */
export async function pruneDiagnoseRequests(nowMs: number): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    await supabase
      .from("diagnose_requests")
      .delete()
      .lt("created_at", new Date(nowMs - WINDOW_MS * 2).toISOString());
  } catch (error) {
    console.error("[diagnose] prune failed", error);
  }
}
