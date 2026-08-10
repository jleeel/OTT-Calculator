"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The organiser's view of the board: every measurement on record, with a remove
 * control on each one.
 *
 * The passcode is held in component state for the length of the visit and is
 * never written to storage or a cookie. That is the point of gating this per
 * request rather than exchanging the passcode for a session — this is used
 * rarely, deliberately, and a page left open on a phone at a weigh-off should
 * not stay armed.
 */

export type AdminMeasurement = {
  id: string;
  ott: number;
  estimated_lbs: number;
  measured_on: string;
  onBoard: boolean;
};

export type AdminPumpkin = {
  key: string;
  growerName: string;
  pumpkinName: string;
  location: string;
  measurements: AdminMeasurement[];
};

const CARD = "mb-4 rounded-2xl border border-cream-edge bg-cream p-5";
const CARD_TITLE = "mb-3.5 text-xs font-bold tracking-[0.09em] uppercase text-vine";

type RowState = "idle" | "confirm" | "working";

export default function AdminBoard({ pumpkins }: { pumpkins: AdminPumpkin[] }) {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const armed = passcode.trim().length > 0;

  function setRow(id: string, value: RowState) {
    setRowState((prev) => ({ ...prev, [id]: value }));
  }

  async function remove(id: string, label: string) {
    setRow(id, "working");
    setMessage(null);

    let response: Response;
    try {
      response = await fetch(`/api/admin/entries/${id}`, {
        method: "DELETE",
        headers: { "x-admin-passcode": passcode.trim() },
      });
    } catch {
      setRow(id, "idle");
      setMessage("Could not reach the server. Check your connection.");
      return;
    }

    if (response.ok) {
      // Optimistic, then a refresh: the row below it becomes the board row, and
      // that recalculation happens on the server.
      setRemoved((prev) => new Set(prev).add(id));
      setMessage(`Removed ${label}.`);
      router.refresh();
      return;
    }

    setRow(id, "idle");
    setMessage(
      response.status === 401
        ? "That passcode was not accepted."
        : response.status === 503
          ? "ADMIN_PASSCODE is not set on this deployment."
          : response.status === 404
            ? "That entry was already gone."
            : "Could not remove that entry. Try again in a moment.",
    );
  }

  return (
    <>
      <section className={CARD}>
        <h2 className={CARD_TITLE}>Admin passcode</h2>
        <input
          type="password"
          value={passcode}
          autoComplete="off"
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Enter to arm the remove buttons"
          className="w-full rounded-xl border border-cream-edge bg-white px-3.5 py-3 text-base text-ink"
        />
        <p className="mt-3 text-tiny leading-[1.6] text-sage">
          Held in this page only, for as long as it stays open. It is not saved
          and not put in a cookie — reload and you enter it again. This is{" "}
          <strong className="font-semibold">not</strong> the patch passcode
          growers use to post.
        </p>
        {message && (
          <p className="mt-3 rounded-xl bg-cream-dim px-3.5 py-3 text-small leading-relaxed text-ink">
            {message}
          </p>
        )}
      </section>

      {pumpkins.length === 0 ? (
        <section className={CARD}>
          <h2 className={CARD_TITLE}>Nothing on the board</h2>
          <p className="text-small leading-relaxed text-sage">
            No measurements have been posted yet.
          </p>
        </section>
      ) : (
        pumpkins.map((pumpkin) => (
          <section key={pumpkin.key} className={CARD}>
            <h2 className={CARD_TITLE}>{pumpkin.pumpkinName}</h2>
            <p className="-mt-2 mb-3 text-tiny text-sage">
              {pumpkin.growerName} · {pumpkin.location}
            </p>

            <ul>
              {pumpkin.measurements.map((row) => {
                const gone = removed.has(row.id);
                const state = rowState[row.id] ?? "idle";
                const label = `${pumpkin.pumpkinName} on ${row.measured_on}`;

                return (
                  <li
                    key={row.id}
                    className={`grid gap-1.5 border-t border-cream-edge py-3 first:border-t-0 first:pt-0 ${
                      gone ? "opacity-45" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="numerals text-small font-semibold text-vine">
                        {row.ott.toFixed(1)}&quot;
                      </span>
                      <span className="numerals text-small text-ink">
                        ~{Math.round(row.estimated_lbs).toLocaleString("en-US")} lb
                      </span>
                      <span className="numerals text-tiny text-sage">
                        {row.measured_on}
                      </span>
                      {row.onBoard && !gone && (
                        <span className="rounded-full bg-cream-dim px-2 py-0.5 text-micro font-semibold text-vine">
                          on the board
                        </span>
                      )}
                    </div>

                    {gone ? (
                      <span className="text-micro font-semibold text-sage">
                        Removed
                      </span>
                    ) : state === "confirm" ? (
                      <span className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => remove(row.id, label)}
                          className="cursor-pointer rounded-full bg-vine px-3 py-1 text-micro font-semibold text-cream"
                        >
                          Remove it
                        </button>
                        <button
                          type="button"
                          onClick={() => setRow(row.id, "idle")}
                          className="cursor-pointer text-micro font-semibold text-sage underline"
                        >
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={!armed || state === "working"}
                        onClick={() => setRow(row.id, "confirm")}
                        className="w-fit cursor-pointer text-micro font-semibold text-sage underline underline-offset-2 hover:text-vine disabled:cursor-default disabled:no-underline disabled:opacity-45"
                      >
                        {state === "working"
                          ? "Removing…"
                          : armed
                            ? "Remove"
                            : "Enter the passcode to remove"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
