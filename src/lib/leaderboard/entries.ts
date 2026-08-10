import "server-only";

import { ottWeight, totalOtt } from "@/lib/ott";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
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
  };
}

/**
 * Insert a validated entry using the service role key.
 *
 * `ott` is a generated column and is deliberately not sent. `estimated_lbs` is
 * computed here rather than accepted from the caller.
 */
export async function insertEntry(input: EntryInput): Promise<LeaderboardRow> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("entries")
    .insert({
      grower_name: input.grower_name,
      location: input.location,
      pumpkin_name: input.pumpkin_name,
      circumference: input.circumference,
      side_to_side: input.side_to_side,
      end_to_end: input.end_to_end,
      estimated_lbs: estimateLbs(input),
      pollination_date: input.pollination_date,
      measured_on: input.measured_on,
    })
    .select(
      "id, grower_name, location, pumpkin_name, ott, estimated_lbs, measured_on, pollination_date",
    )
    .single();

  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
  return toRow(data as Record<string, unknown>);
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
      "id, grower_name, location, pumpkin_name, ott, estimated_lbs, measured_on, pollination_date",
    )
    .order("ott", { ascending: false })
    .limit(MAX_ROWS);

  if (error) throw new Error(`Supabase read failed: ${error.message}`);
  return (data ?? []).map((row) => toRow(row as Record<string, unknown>));
}
