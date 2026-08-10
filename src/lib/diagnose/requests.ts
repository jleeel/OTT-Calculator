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
 */
export async function claimDiagnoseSlot(
  ip: string,
  nowMs: number,
): Promise<Quota> {
  const supabase = createServiceRoleClient();
  const hash = hashIp(ip, ipSecret());
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
