"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ottWeight, totalOtt } from "@/lib/ott";

/** The active fruit's most recent logged measurement, used to prefill. */
export type LatestMeasurement = {
  date: string;
  c: number;
  ss: number;
  ee: number;
};

/** Grower name and location are reused every submit, so they are remembered. */
const GROWER_KEY = "agoptics-ott-grower-v1";

type FormState = {
  grower_name: string;
  location: string;
  pumpkin_name: string;
  circumference: string;
  side_to_side: string;
  end_to_end: string;
  measured_on: string;
  pollination_date: string;
};

type Status =
  | { kind: "editing" }
  | { kind: "submitting" }
  | { kind: "done" }
  | { kind: "error"; message: string; fields: Record<string, string> };

const FIELD =
  "w-full rounded-xl border border-cream-edge bg-white px-3.5 py-3 text-base text-ink focus:outline-2 focus:outline-blue focus:-outline-offset-1";
const LABEL = "mb-1.5 block text-tiny text-sage";

function loadGrower(): { grower_name: string; location: string } {
  try {
    const raw = window.localStorage.getItem(GROWER_KEY);
    if (!raw) return { grower_name: "", location: "" };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      grower_name: typeof parsed.grower_name === "string" ? parsed.grower_name : "",
      location: typeof parsed.location === "string" ? parsed.location : "",
    };
  } catch {
    return { grower_name: "", location: "" };
  }
}

function saveGrower(grower_name: string, location: string): void {
  try {
    window.localStorage.setItem(
      GROWER_KEY,
      JSON.stringify({ grower_name, location }),
    );
  } catch {
    // Storage unavailable; the grower just retypes next time.
  }
}

export default function EnterLeaderboard({
  fruitName,
  latest,
}: {
  fruitName: string;
  latest: LatestMeasurement | null;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "editing" });
  const [passcode, setPasscode] = useState("");
  const [needsPasscode, setNeedsPasscode] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (open) firstFieldRef.current?.focus();
  }, [open, form]);

  function openDialog() {
    if (!latest) return;
    const grower = loadGrower();
    setForm({
      grower_name: grower.grower_name,
      location: grower.location,
      pumpkin_name: fruitName,
      circumference: String(latest.c),
      side_to_side: String(latest.ss),
      end_to_end: String(latest.ee),
      measured_on: latest.date,
      pollination_date: "",
    });
    setStatus({ kind: "editing" });
    setPasscode("");
    setOpen(true);

    // Ask whether this browser already holds a session, so a returning grower
    // is not shown a passcode box for no reason.
    fetch("/api/leaderboard/auth")
      .then((r) => (r.ok ? r.json() : { authenticated: false }))
      .then((data: { authenticated?: boolean }) =>
        setNeedsPasscode(!data.authenticated),
      )
      .catch(() => setNeedsPasscode(true));
  }

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setStatus({ kind: "submitting" });

    try {
      if (needsPasscode || passcode.trim().length > 0) {
        const auth = await fetch("/api/leaderboard/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passcode }),
        });
        if (!auth.ok) {
          const data = (await auth.json().catch(() => ({}))) as { error?: string };
          setNeedsPasscode(true);
          setStatus({
            kind: "error",
            message: data.error ?? "That passcode was not accepted.",
            fields: {},
          });
          return;
        }
        setNeedsPasscode(false);
      }

      const response = await fetch("/api/leaderboard/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          pollination_date: form.pollination_date || null,
        }),
      });

      if (response.ok) {
        saveGrower(form.grower_name, form.location);
        setStatus({ kind: "done" });
        return;
      }

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        fields?: { field: string; message: string }[];
      };

      if (response.status === 401 || data.code === "passcode_required") {
        setNeedsPasscode(true);
      }

      setStatus({
        kind: "error",
        message: data.error ?? "That submission did not go through.",
        fields: Object.fromEntries(
          (data.fields ?? []).map((f) => [f.field, f.message]),
        ),
      });
    } catch {
      setStatus({
        kind: "error",
        message:
          "Could not reach the server. Check your connection and try again.",
        fields: {},
      });
    }
  }

  const estimate = form
    ? ottWeight(
        totalOtt(
          Number.parseFloat(form.circumference) || 0,
          Number.parseFloat(form.side_to_side) || 0,
          Number.parseFloat(form.end_to_end) || 0,
        ),
      )
    : 0;

  const fieldError = (name: string) =>
    status.kind === "error" ? status.fields[name] : undefined;

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={!latest}
        className="w-full rounded-xl border-2 border-vine bg-transparent px-5 text-small font-semibold text-vine transition-colors hover:bg-vine hover:text-cream disabled:border-cream-edge disabled:text-sage disabled:hover:bg-transparent disabled:hover:text-sage"
      >
        Enter the leaderboard
      </button>
      {!latest && (
        <p className="mt-2 text-center text-tiny text-sage">
          Save a measurement first — the entry is built from your most recent one.
        </p>
      )}

      {open && form && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-vine/60 p-0 sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="enter-leaderboard-title"
            className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-t-[14px] bg-cream p-5 sm:rounded-2xl"
          >
            <div className="mb-3.5 flex items-baseline justify-between gap-3">
              <h2
                id="enter-leaderboard-title"
                className="text-xs font-bold tracking-[0.09em] text-vine uppercase"
              >
                Enter the leaderboard
              </h2>
              <button
                type="button"
                onClick={close}
                className="cursor-pointer text-tiny font-semibold text-sage hover:text-vine"
              >
                Close
              </button>
            </div>

            {status.kind === "done" ? (
              <div>
                <p className="rounded-xl bg-vine px-[18px] py-4 text-small font-semibold text-cream">
                  You are on the board.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-sage">
                  The board ranks on measured inches. Measure again any time — it keeps the most recent entry for this pumpkin.
                </p>
                <div className="mt-4 flex gap-2.5">
                  <Link
                    href="/leaderboard"
                    className="flex-1 rounded-xl bg-gold p-3.5 text-center text-small font-bold text-ink"
                  >
                    See the board
                  </Link>
                  <button
                    type="button"
                    onClick={close}
                    className="flex-1 cursor-pointer rounded-xl border border-cream-edge bg-white p-3.5 text-small font-bold text-sage"
                  >
                    Keep measuring
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} noValidate>
                {status.kind === "error" && (
                  <p className="mb-3.5 rounded-xl bg-pumpkin/10 px-[18px] py-3.5 text-tiny font-semibold text-[#8f3c05]">
                    {status.message}
                  </p>
                )}

                <div className="mb-3.5">
                  <label className={LABEL} htmlFor="grower_name">
                    Your name
                  </label>
                  <input
                    ref={firstFieldRef}
                    id="grower_name"
                    className={FIELD}
                    value={form.grower_name}
                    maxLength={60}
                    onChange={(e) => set("grower_name", e.target.value)}
                  />
                  {fieldError("grower_name") && (
                    <p className="mt-1 text-tiny text-[#8f3c05]">
                      {fieldError("grower_name")}
                    </p>
                  )}
                </div>

                <div className="mb-3.5">
                  <label className={LABEL} htmlFor="location">
                    Town
                  </label>
                  <input
                    id="location"
                    className={FIELD}
                    value={form.location}
                    maxLength={60}
                    placeholder="Tulare, CA"
                    onChange={(e) => set("location", e.target.value)}
                  />
                  {fieldError("location") && (
                    <p className="mt-1 text-tiny text-[#8f3c05]">
                      {fieldError("location")}
                    </p>
                  )}
                </div>

                <div className="mb-3.5">
                  <label className={LABEL} htmlFor="pumpkin_name">
                    Pumpkin name
                  </label>
                  <input
                    id="pumpkin_name"
                    className={FIELD}
                    value={form.pumpkin_name}
                    maxLength={40}
                    onChange={(e) => set("pumpkin_name", e.target.value)}
                  />
                  {fieldError("pumpkin_name") && (
                    <p className="mt-1 text-tiny text-[#8f3c05]">
                      {fieldError("pumpkin_name")}
                    </p>
                  )}
                </div>

                <div className="mb-3.5 grid grid-cols-3 gap-2.5">
                  {(
                    [
                      ["circumference", "Circumference"],
                      ["side_to_side", "Side to side"],
                      ["end_to_end", "End to end"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key}>
                      <label className={LABEL} htmlFor={key}>
                        {label}
                      </label>
                      <input
                        id={key}
                        inputMode="decimal"
                        className={`${FIELD} px-2.5 text-right numerals`}
                        value={form[key]}
                        onChange={(e) => set(key, e.target.value)}
                      />
                      {fieldError(key) && (
                        <p className="mt-1 text-tiny text-[#8f3c05]">
                          {fieldError(key)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mb-3.5 flex gap-2.5">
                  <div className="flex-1">
                    <label className={LABEL} htmlFor="measured_on">
                      Measured on
                    </label>
                    <input
                      id="measured_on"
                      type="date"
                      className={FIELD}
                      value={form.measured_on}
                      onChange={(e) => set("measured_on", e.target.value)}
                    />
                    {fieldError("measured_on") && (
                      <p className="mt-1 text-tiny text-[#8f3c05]">
                        {fieldError("measured_on")}
                      </p>
                    )}
                  </div>
                  <div className="flex-1">
                    <label className={LABEL} htmlFor="pollination_date">
                      Pollinated <span className="text-sage">(optional)</span>
                    </label>
                    <input
                      id="pollination_date"
                      type="date"
                      className={FIELD}
                      value={form.pollination_date}
                      onChange={(e) => set("pollination_date", e.target.value)}
                    />
                    {fieldError("pollination_date") && (
                      <p className="mt-1 text-tiny text-[#8f3c05]">
                        {fieldError("pollination_date")}
                      </p>
                    )}
                  </div>
                </div>

                {needsPasscode && (
                  <div className="mb-3.5">
                    <label className={LABEL} htmlFor="passcode">
                      Patch passcode
                    </label>
                    <input
                      id="passcode"
                      type="password"
                      autoComplete="off"
                      className={FIELD}
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                    />
                    <p className="mt-1 text-tiny text-sage">
                      Asked once, then remembered on this device.
                    </p>
                  </div>
                )}

                <div className="mb-3.5 rounded-xl bg-cream-dim px-[18px] py-3.5">
                  <div className="text-tiny font-bold text-vine">
                    Posting as
                  </div>
                  <div className="mt-0.5 text-small font-semibold text-vine numerals">
                    {totalOtt(
                      Number.parseFloat(form.circumference) || 0,
                      Number.parseFloat(form.side_to_side) || 0,
                      Number.parseFloat(form.end_to_end) || 0,
                    ).toFixed(1)}
                    &quot; OTT · ~{Math.round(estimate).toLocaleString("en-US")} lb
                  </div>
                  <div className="mt-1 text-tiny text-vine">
                    The board ranks on OTT inches. Weight is recalculated on the
                    server from these three numbers.
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={status.kind === "submitting"}
                  className="w-full cursor-pointer rounded-xl bg-gold p-3.5 text-small font-bold text-ink disabled:cursor-default disabled:bg-cream-edge"
                >
                  {status.kind === "submitting" ? "Posting your pumpkin…" : "Post to the leaderboard"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
