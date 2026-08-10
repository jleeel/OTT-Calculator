import type { Metadata } from "next";
import Link from "next/link";
import AdminBoard, {
  type AdminPumpkin,
} from "@/components/AdminBoard";
import {
  fetchAllHistory,
  fetchLeaderboard,
  historyKey,
} from "@/lib/leaderboard/entries";

/**
 * The organiser's page: every measurement on record, each with a remove
 * control.
 *
 * Reading is not gated. Everything shown here is already public on
 * /leaderboard — the gate belongs on the deletion, which is where it is, in
 * /api/admin/entries/[id] against ADMIN_PASSCODE. Gating the read as well would
 * add a second place to get authorisation wrong while protecting nothing.
 *
 * Deletion is soft: rows are marked `deleted_at` and kept, so a mistake here is
 * recoverable from the database.
 */

const TITLE = "Organiser · Giant Pumpkin Calculator";

export const metadata: Metadata = {
  title: TITLE,
  // Not secret, but not something to turn up in a search for the leaderboard.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const CARD = "mb-4 rounded-2xl border border-cream-edge bg-cream p-5";
const CARD_TITLE = "mb-3.5 text-xs font-bold tracking-[0.09em] uppercase text-vine";

export default async function AdminPage() {
  let pumpkins: AdminPumpkin[] = [];
  let loadError: string | null = null;

  try {
    const [board, history] = await Promise.all([
      fetchLeaderboard(),
      fetchAllHistory(),
    ]);

    pumpkins = board.map((row) => {
      const key = historyKey(row.grower_name, row.pumpkin_name);
      const rows = history.get(key) ?? [];
      return {
        key,
        growerName: row.grower_name,
        pumpkinName: row.pumpkin_name,
        location: row.location,
        // Newest first: the row that is on the board is the one most likely to
        // be the mistake being fixed.
        measurements: [...rows]
          .reverse()
          .map((measurement) => ({
            id: measurement.id,
            ott: measurement.ott,
            estimated_lbs: measurement.estimated_lbs,
            measured_on: measurement.measured_on,
            onBoard: measurement.id === row.id,
          })),
      };
    });
  } catch (error) {
    console.error("[admin]", error);
    loadError =
      "The board could not be loaded just now. Refresh in a moment — nothing has been changed.";
  }

  return (
    <>
      <section className={CARD}>
        <h1 className="display-face text-title leading-tight text-vine">
          Organiser
        </h1>
        <p className="mt-2 text-small leading-relaxed text-sage">
          Every measurement on record, newest first under each pumpkin. Removing
          one takes it off the{" "}
          <Link href="/leaderboard" className="font-semibold text-vine underline">
            board
          </Link>{" "}
          and out of that pumpkin&apos;s public history. If you remove the row
          that is currently on the board, the one before it takes its place.
        </p>
        <p className="mt-3 text-tiny leading-[1.6] text-sage">
          Removals are soft — the row is kept in the database and hidden, so a
          mistake here can be undone. Growers can already remove their own
          entries from the board on the device that posted them; this is for the
          ones who cannot.
        </p>
      </section>

      {loadError ? (
        <section className={CARD}>
          <h2 className={CARD_TITLE}>Could not load</h2>
          <p className="text-small leading-relaxed text-sage">{loadError}</p>
        </section>
      ) : (
        <AdminBoard pumpkins={pumpkins} />
      )}
    </>
  );
}
