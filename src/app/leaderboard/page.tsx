import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import RemoveEntry from "@/components/RemoveEntry";
import {
  STALE_AFTER_DAYS,
  fetchAllHistory,
  fetchLeaderboard,
  historyKey,
  type HistoryRow,
  type LeaderboardRow,
} from "@/lib/leaderboard/entries";
import { FLAG_NOTE } from "@/lib/leaderboard/flags";
import { ownerCookieName, verifyOwnership } from "@/lib/leaderboard/ownership";
import { requirePasscode } from "@/lib/leaderboard/session";
import { daysBetween, lbPerDay } from "@/lib/ott";

const TITLE = "Leaderboard · Giant Pumpkin Calculator";
const DESCRIPTION =
  "Season leaderboard of giant pumpkin measurements, ranked by measured OTT inches.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/leaderboard" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

// The board changes whenever someone submits, so it is never prerendered.
export const dynamic = "force-dynamic";

const HEADER_NOTE =
  "Ranked by measured OTT inches. Estimated weight is shown for reference " +
  "only and carries about plus or minus 5% error. This is for fun; official " +
  "weights come from a scale at a sanctioned weigh-off.";

const CARD = "mb-4 rounded-2xl border border-cream-edge bg-cream p-5";
const CARD_TITLE = "mb-3.5 text-xs font-bold tracking-[0.09em] uppercase text-vine";

type Ranked = LeaderboardRow & {
  rank: number;
  daysSince: number;
  stale: boolean;
  owned: boolean;
  history: HistoryRow[];
};

function rank(
  rows: LeaderboardRow[],
  today: string,
  owned: Set<string>,
  history: Map<string, HistoryRow[]>,
): Ranked[] {
  return rows.map((row, i) => {
    const daysSince = Math.max(0, daysBetween(row.measured_on, today));
    return {
      ...row,
      rank: i + 1,
      daysSince,
      stale: daysSince > STALE_AFTER_DAYS,
      owned: owned.has(row.id),
      history: history.get(historyKey(row.grower_name, row.pumpkin_name)) ?? [],
    };
  });
}

/** Neutral grey marker. No red, no triangle, no accusation. */
function FlagMark() {
  return (
    <span
      title={FLAG_NOTE}
      aria-label={FLAG_NOTE}
      className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-cream-edge align-middle text-[10px] font-bold text-sage"
    >
      i
    </span>
  );
}

function VerifiedMark({ note }: { note: string | null }) {
  const label = note
    ? `Verified grower — ${note}`
    : "Verified grower";
  return (
    <span
      title={label}
      aria-label={label}
      className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-tape-1)] align-middle text-[10px] font-bold text-cream"
    >
      ✓
    </span>
  );
}

/** The real integrity mechanism: one tap to the full measurement history. */
function History({ rows }: { rows: HistoryRow[] }) {
  if (rows.length === 0) return null;
  return (
    <details className="mt-2">
      <summary className="inline-flex items-center text-micro font-semibold text-vine underline underline-offset-2">
        {rows.length} measurement{rows.length === 1 ? "" : "s"} on record
      </summary>
      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr className="text-micro tracking-wider text-sage uppercase">
            <th className="pb-1 text-left font-semibold">Date</th>
            <th className="pb-1 text-right font-semibold">Inches</th>
            <th className="pb-1 text-right font-semibold">Pounds</th>
            <th className="pb-1 text-right font-semibold">lb/day</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const prev = rows[i - 1];
            const rate = prev
              ? lbPerDay(
                  { date: prev.measured_on, lbs: prev.estimated_lbs },
                  { date: r.measured_on, lbs: r.estimated_lbs },
                )
              : null;
            return (
              <tr key={r.id} className="numerals text-tiny">
                <td className="border-t border-cream-edge py-1.5 text-sage">
                  {r.measured_on.slice(5)}
                </td>
                <td className="border-t border-cream-edge py-1.5 text-right text-sage">
                  {r.ott.toFixed(1)}
                </td>
                <td className="border-t border-cream-edge py-1.5 text-right font-semibold">
                  {Math.round(r.estimated_lbs).toLocaleString("en-US")}
                  {r.flags.length > 0 && <FlagMark />}
                </td>
                <td className="border-t border-cream-edge py-1.5 text-right text-vine">
                  {rate === null ? "—" : `${rate >= 0 ? "+" : ""}${rate.toFixed(1)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}

function ago(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function lbs(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export default async function LeaderboardPage() {
  const today = new Date().toISOString().slice(0, 10);

  let rows: Ranked[] = [];
  let loadError: string | null = null;

  try {
    const [board, history, store] = await Promise.all([
      fetchLeaderboard(),
      fetchAllHistory(),
      cookies(),
    ]);

    // Ownership lives in httpOnly cookies the client cannot read, so the
    // server decides which rows get a remove control.
    const owned = new Set<string>();
    try {
      const secret = requirePasscode();
      for (const row of board) {
        if (verifyOwnership(store.get(ownerCookieName(row.id))?.value, secret)) {
          owned.add(row.id);
        }
      }
    } catch {
      // Passcode unset: nobody owns anything, board still renders.
    }

    rows = rank(board, today, owned, history);
  } catch (error) {
    console.error("[leaderboard]", error);
    loadError =
      "The board could not be loaded just now. Refresh in a moment — your entries are safe.";
  }

  return (
    <>
      <section className={CARD}>
        <h2 className={CARD_TITLE}>Season leaderboard</h2>
        <p className="text-tiny leading-[1.6] text-sage">{HEADER_NOTE}</p>
        <p className="mt-2 text-tiny leading-[1.6] text-sage">
          <VerifiedMark note={null} /> Verified growers have had a pumpkin on a
          scale at a sanctioned weigh-off.
        </p>
      </section>

      {loadError ? (
        <section className={CARD}>
          <p className="text-sm leading-relaxed text-sage">{loadError}</p>
        </section>
      ) : rows.length === 0 ? (
        <section className={CARD}>
          <h2 className={CARD_TITLE}>No entries yet</h2>
          <p className="text-sm leading-relaxed text-sage">
            Nobody has posted a measurement yet, so the board is wide open.
            First one up sets the mark.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-sage">
            Measure your fruit on the{" "}
            <Link href="/" className="font-semibold text-vine underline">
              calculator
            </Link>
            , log it, then hit <strong className="font-semibold">Enter the
            leaderboard</strong>. You will need the patch passcode.
          </p>
        </section>
      ) : (
        <section className={CARD}>
          <h2 className={CARD_TITLE}>
            {rows.length} pumpkin{rows.length === 1 ? "" : "s"} on the board
          </h2>

          {/* Phones: one card per pumpkin. Most of this traffic is from Facebook. */}
          <ul className="sm:hidden">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex gap-3 border-t border-cream-edge py-3.5 first:border-t-0 first:pt-0"
              >
                <div
                  className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg text-tiny font-bold ${
                    row.stale ? "bg-cream-dim text-sage" : "bg-cream-dim text-vine"
                  }`}
                >
                  {row.rank}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <strong
                      className={`truncate text-small font-semibold ${
                        row.stale ? "text-sage" : ""
                      }`}
                    >
                      {row.pumpkin_name}
                    </strong>
                    <span
                      className={`flex-none text-small font-bold numerals ${
                        row.stale ? "text-sage" : "text-vine"
                      }`}
                    >
                      {row.ott.toFixed(1)}&quot;
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-tiny text-sage">
                    {row.grower_name}
                    {row.grower_verified && (
                      <VerifiedMark note={row.grower_verified_note} />
                    )}{" "}
                    · {row.location}
                  </div>
                  <div className="mt-0.5 text-tiny text-sage">
                    ~{lbs(row.estimated_lbs)} lb · {ago(row.daysSince)}
                    {row.stale && (
                      <span className="ml-1.5 rounded-full bg-cream-dim px-1.5 py-0.5 text-micro font-semibold text-sage">
                        stale
                      </span>
                    )}
                    {row.flags.length > 0 && <FlagMark />}
                  </div>
                  <History rows={row.history} />
                  {row.owned && (
                    <div className="mt-1.5">
                      <RemoveEntry id={row.id} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Wider screens: the full table. */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["#", "Pumpkin", "Grower", "Location"].map((h) => (
                    <th
                      key={h}
                      className="pb-[9px] text-left text-micro font-bold tracking-[0.06em] text-sage uppercase"
                    >
                      {h}
                    </th>
                  ))}
                  {["OTT", "Est. lb", "Measured"].map((h) => (
                    <th
                      key={h}
                      className="pb-[9px] text-right text-micro font-bold tracking-[0.06em] text-sage uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const cell = `border-t border-cream-edge py-3 text-small ${
                    row.stale ? "text-sage" : ""
                  }`;
                  return (
                    <tr key={row.id}>
                      <td className={`${cell} w-8 numerals`}>{row.rank}</td>
                      <td className={`${cell} font-semibold`}>
                        {row.pumpkin_name}
                        {row.flags.length > 0 && <FlagMark />}
                        {row.stale && (
                          <span className="ml-2 rounded-full bg-cream-dim px-1.5 py-0.5 text-micro font-semibold text-sage">
                            stale
                          </span>
                        )}
                      </td>
                      <td className={cell}>
                        {row.grower_name}
                        {row.grower_verified && (
                          <VerifiedMark note={row.grower_verified_note} />
                        )}
                        <History rows={row.history} />
                        {row.owned && (
                          <div className="mt-1.5">
                            <RemoveEntry id={row.id} />
                          </div>
                        )}
                      </td>
                      <td className={`${cell} text-sage`}>{row.location}</td>
                      <td className={`${cell} text-right font-bold numerals`}>
                        {row.ott.toFixed(1)}&quot;
                      </td>
                      <td className={`${cell} text-right numerals`}>
                        {lbs(row.estimated_lbs)}
                      </td>
                      <td className={`${cell} text-right text-sage`}>
                        {ago(row.daysSince)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs leading-[1.6] text-sage">
            One row per pumpkin, showing its most recent measurement. Anything
            measured more than {STALE_AFTER_DAYS} days ago is greyed out and
            marked stale — re-measure to move it back up to date.
          </p>
        </section>
      )}
    </>
  );
}
