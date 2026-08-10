import type { Metadata } from "next";
import Link from "next/link";
import {
  STALE_AFTER_DAYS,
  fetchLeaderboard,
  type LeaderboardRow,
} from "@/lib/leaderboard/entries";
import { daysBetween } from "@/lib/ott";

export const metadata: Metadata = {
  title: "Leaderboard · Giant Pumpkin Weight Calculator",
  description:
    "Season leaderboard of giant pumpkin measurements, ranked by measured OTT inches.",
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
};

function rank(rows: LeaderboardRow[], today: string): Ranked[] {
  return rows.map((row, i) => {
    const daysSince = Math.max(0, daysBetween(row.measured_on, today));
    return {
      ...row,
      rank: i + 1,
      daysSince,
      stale: daysSince > STALE_AFTER_DAYS,
    };
  });
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
    rows = rank(await fetchLeaderboard(), today);
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
                    {row.grower_name} · {row.location}
                  </div>
                  <div className="mt-0.5 text-tiny text-sage">
                    ~{lbs(row.estimated_lbs)} lb · {ago(row.daysSince)}
                    {row.stale && (
                      <span className="ml-1.5 rounded-full bg-cream-dim px-1.5 py-0.5 text-micro font-semibold text-sage">
                        stale
                      </span>
                    )}
                  </div>
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
                        {row.stale && (
                          <span className="ml-2 rounded-full bg-cream-dim px-1.5 py-0.5 text-micro font-semibold text-sage">
                            stale
                          </span>
                        )}
                      </td>
                      <td className={cell}>{row.grower_name}</td>
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
