import "server-only";

import { ottWeight, totalOtt } from "@/lib/ott";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { computeFlags, type Flag } from "./flags";
import type { EntryInput } from "./validation";

/** One row of the board: the most recent measurement for a grower's pumpkin. */
export type LeaderboardRow = {
  id: string;
  grower_name: string;
  location: string;
  pumpkin_name: string;
  ott: number;
  estimated_lbs: number;
  measured_on: string;
  pollination_date: string | null;
  flags: Flag[];
  grower_verified: boolean;
  grower_verified_note: string | null;
};

/** One row of a pumpkin's expanded history. */
export type HistoryRow = {
  id: string;
  ott: number;
  estimated_lbs: number;
  measured_on: string;
  flags: Flag[];
};

/** A row is greyed out and labelled stale past this many days. */
export const STALE_AFTER_DAYS = 14;

/** Cap on rows fetched. Far above any plausible local season. */
const MAX_ROWS = 200;

/**
 * Weight for an entry, recomputed from the tape every time.
 *
 * This is the only place an inserted weight comes from — a client-supplied
 * `estimated_lbs` is dropped during validation and never reaches the database.
 */
export function estimateLbs(measurements: {
  circumference: number;
  side_to_side: number;
  end_to_end: number;
}): number {
  const ott = totalOtt(
    measurements.circumference,
    measurements.side_to_side,
    measurements.end_to_end,
  );
  return Math.round(ottWeight(ott) * 10) / 10;
}

/** PostgREST can hand back `numeric` as a string depending on the column. */
function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

function toRow(raw: Record<string, unknown>): LeaderboardRow {
  return {
    id: String(raw.id),
    grower_name: String(raw.grower_name ?? ""),
    location: String(raw.location ?? ""),
    pumpkin_name: String(raw.pumpkin_name ?? ""),
    ott: num(raw.ott),
    estimated_lbs: num(raw.estimated_lbs),
    measured_on: String(raw.measured_on ?? ""),
    pollination_date:
      typeof raw.pollination_date === "string" ? raw.pollination_date : null,
    flags: Array.isArray(raw.flags) ? (raw.flags as Flag[]) : [],
    grower_verified: raw.grower_verified === true,
    grower_verified_note:
      typeof raw.grower_verified_note === "string" ? raw.grower_verified_note : null,
  };
}

/**
 * Insert a validated entry using the service role key.
 *
 * `ott` is a generated column and is deliberately not sent. `estimated_lbs` is
 * computed here rather than accepted from the caller.
 */
export async function insertEntry(
  input: EntryInput,
): Promise<{ row: LeaderboardRow; editToken: string }> {
  const supabase = createServiceRoleClient();

  // Flags compare against this grower+pumpkin's most recent live entry.
  const { data: prior } = await supabase
    .from("entries")
    .select("measured_on, estimated_lbs")
    .eq("grower_name", input.grower_name)
    .eq("pumpkin_name", input.pumpkin_name)
    .is("deleted_at", null)
    .order("measured_on", { ascending: false })
    .limit(1)
    .maybeSingle();

  const estimated_lbs = estimateLbs(input);
  const flags = computeFlags(
    { ...input, estimated_lbs },
    prior
      ? {
          measured_on: String(prior.measured_on),
          estimated_lbs: num(prior.estimated_lbs),
        }
      : null,
  );

  const { data, error } = await supabase
    .from("entries")
    .insert({
      flags,
      grower_name: input.grower_name,
      location: input.location,
      pumpkin_name: input.pumpkin_name,
      circumference: input.circumference,
      side_to_side: input.side_to_side,
      end_to_end: input.end_to_end,
      estimated_lbs,
      pollination_date: input.pollination_date,
      measured_on: input.measured_on,
    })
    .select(
      "id, grower_name, location, pumpkin_name, ott, estimated_lbs, measured_on, pollination_date, flags, edit_token",
    )
    .single();

  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
  const record = data as Record<string, unknown>;
  return { row: toRow(record), editToken: String(record.edit_token) };
}

/**
 * Soft delete. Returns false when the token does not match, so the caller can
 * answer identically whether the entry is missing or simply not theirs.
 */
export async function softDeleteEntry(
  id: string,
  editToken: string,
): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("entries")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("edit_token", editToken)
    .is("deleted_at", null)
    .select("id");

  if (error) throw new Error(`Supabase delete failed: ${error.message}`);
  return (data ?? []).length > 0;
}

/** Admin delete: no token required, already gated on ADMIN_PASSCODE. */
export async function adminDeleteEntry(id: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("entries")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");

  if (error) throw new Error(`Supabase delete failed: ${error.message}`);
  return (data ?? []).length > 0;
}

/** Every live measurement for one grower's pumpkin, oldest first. */
export async function fetchHistory(
  growerName: string,
  pumpkinName: string,
): Promise<HistoryRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("entry_history")
    .select("id, ott, estimated_lbs, measured_on, flags")
    .eq("grower_name", growerName)
    .eq("pumpkin_name", pumpkinName)
    .order("measured_on", { ascending: true });

  if (error) throw new Error(`Supabase history read failed: ${error.message}`);
  return (data ?? []).map((r) => {
    const raw = r as Record<string, unknown>;
    return {
      id: String(raw.id),
      ott: num(raw.ott),
      estimated_lbs: num(raw.estimated_lbs),
      measured_on: String(raw.measured_on),
      flags: Array.isArray(raw.flags) ? (raw.flags as Flag[]) : [],
    };
  });
}

/**
 * The board, best OTT first. Reads the `leaderboard_current` view, which keeps
 * only each grower+pumpkin's most recent measurement, through the anon key so
 * Row Level Security still applies.
 */
export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("leaderboard_current")
    .select(
      "id, grower_name, location, pumpkin_name, ott, estimated_lbs, measured_on, pollination_date, flags, grower_verified, grower_verified_note",
    )
    .order("ott", { ascending: false })
    .limit(MAX_ROWS);

  if (error) throw new Error(`Supabase read failed: ${error.message}`);
  return (data ?? []).map((row) => toRow(row as Record<string, unknown>));
}

/**
 * History for every pumpkin on the board, in one query, grouped by
 * grower+pumpkin. Cheaper than a query per row and the season is small.
 */
export async function fetchAllHistory(): Promise<Map<string, HistoryRow[]>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("entry_history")
    .select("id, grower_name, pumpkin_name, ott, estimated_lbs, measured_on, flags")
    .order("measured_on", { ascending: true })
    .limit(2000);

  if (error) throw new Error(`Supabase history read failed: ${error.message}`);

  const grouped = new Map<string, HistoryRow[]>();
  for (const r of data ?? []) {
    const raw = r as Record<string, unknown>;
    const key = `${String(raw.grower_name)}|${String(raw.pumpkin_name)}`;
    const list = grouped.get(key) ?? [];
    list.push({
      id: String(raw.id),
      ott: num(raw.ott),
      estimated_lbs: num(raw.estimated_lbs),
      measured_on: String(raw.measured_on),
      flags: Array.isArray(raw.flags) ? (raw.flags as Flag[]) : [],
    });
    grouped.set(key, list);
  }
  return grouped;
}

/** Key for the history map. */
export function historyKey(growerName: string, pumpkinName: string): string {
  return `${growerName}|${pumpkinName}`;
}
