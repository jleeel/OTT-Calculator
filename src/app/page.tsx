"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import EnterLeaderboard, {
  type LatestMeasurement,
} from "@/components/EnterLeaderboard";
import PumpkinDiagram, { type TapeKey } from "@/components/PumpkinDiagram";
import { milestoneMessage } from "@/lib/milestones";
import {
  MAX_DAP,
  PROJECTION_TOLERANCE,
  projectFinalWeight,
  roundProjection,
} from "@/lib/projection";
import { daysBetween, lbPerDay, ottWeight, totalOtt, weightRange } from "@/lib/ott";

/**
 * The personal measurement log lives in this browser and never leaves the
 * device. Submitting to the leaderboard is a separate, deliberate action.
 */
const STORAGE_KEY = "agoptics-ott-v1";

/**
 * Fixed id for the starter fruit so the server render and the first client
 * render agree. Stored data replaces this after hydration.
 */
const SEED_ID = "pumpkin-1";

type Entry = {
  /** ISO yyyy-mm-dd */
  date: string;
  /** circumference, inches */
  c: number;
  /** side to side, inches */
  ss: number;
  /** end to end, inches */
  ee: number;
  ott: number;
  lbs: number;
};

type Fruit = {
  id: string;
  name: string;
  entries: Entry[];
  /** ISO yyyy-mm-dd. Optional: fruit saved before projection existed has neither. */
  pollinationDate?: string;
  expectedEndDate?: string;
};

type Patch = {
  fruits: Fruit[];
  activeId: string;
};

/** Plain language first; the grower-group jargon comes second, in the hint. */
const MEASUREMENTS: {
  key: TapeKey;
  step: string;
  title: string;
  hint: string;
}[] = [
  {
    key: "c",
    step: "1",
    title: "Around the middle",
    hint: "The widest way around, level with the ground.",
  },
  {
    key: "ss",
    step: "2",
    title: "Side to side",
    hint: "Widest point from side to side.",
  },
  {
    key: "ee",
    step: "3",
    title: "Stem end to blossom end",
    hint: "Over the top from the stem end to the blossom end.",
  },
];

function seedPatch(): Patch {
  return {
    fruits: [{ id: SEED_ID, name: "Pumpkin 1", entries: [] }],
    activeId: SEED_ID,
  };
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `f${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function isEntry(value: unknown): value is Entry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.date === "string" &&
    typeof e.ott === "number" &&
    typeof e.lbs === "number"
  );
}

/** Storage can hold anything a previous version wrote, so validate before trusting it. */
function parsePatch(raw: string | null): Patch {
  if (!raw) return seedPatch();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return seedPatch();

    const { fruits, activeId } = parsed as { fruits?: unknown; activeId?: unknown };
    if (!Array.isArray(fruits) || fruits.length === 0) return seedPatch();

    const clean: Fruit[] = fruits
      .filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
      .map((f, i) => ({
        id: typeof f.id === "string" ? f.id : `${SEED_ID}-${i}`,
        name: typeof f.name === "string" ? f.name : `Pumpkin ${i + 1}`,
        entries: Array.isArray(f.entries) ? f.entries.filter(isEntry) : [],
        ...(typeof f.pollinationDate === "string" && f.pollinationDate
          ? { pollinationDate: f.pollinationDate }
          : {}),
        ...(typeof f.expectedEndDate === "string" && f.expectedEndDate
          ? { expectedEndDate: f.expectedEndDate }
          : {}),
      }));

    if (clean.length === 0) return seedPatch();

    const active = clean.some((f) => f.id === activeId)
      ? (activeId as string)
      : clean[0].id;
    return { fruits: clean, activeId: active };
  } catch {
    return seedPatch();
  }
}

/* -------------------------------------------------------------------------
 * localStorage as an external store. Unchanged from the previous version —
 * same key, same shape, same hydration approach.
 * ---------------------------------------------------------------------- */

const SERVER_SNAPSHOT: Patch = seedPatch();

let cachedRaw: string | null | undefined;
let cachedPatch: Patch = SERVER_SNAPSHOT;
let storageWorks = true;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function handleStorageEvent(event: StorageEvent): void {
  if (event.key === STORAGE_KEY || event.key === null) emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", handleStorageEvent);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("storage", handleStorageEvent);
    }
  };
}

function readRaw(): string | null | undefined {
  if (!storageWorks) return cachedRaw;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    storageWorks = false;
    return cachedRaw;
  }
}

function getSnapshot(): Patch {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedPatch = parsePatch(raw ?? null);
  }
  return cachedPatch;
}

function getServerSnapshot(): Patch {
  return SERVER_SNAPSHOT;
}

function writePatch(next: Patch): void {
  cachedPatch = next;
  cachedRaw = JSON.stringify(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, cachedRaw);
  } catch {
    storageWorks = false;
  }
  emit();
}

const NEVER_CHANGES = () => () => {};

function todayISO(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function noDateOnServer(): string {
  return "";
}

function shortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function lb(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** parseFloat, but blank/garbage/negative all read as "not measured yet". */
function inches(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const CARD = "rounded-2xl bg-cream p-5 shadow-[0_2px_16px_rgba(0,0,0,0.16)]";

/** Matches the tape colours in the diagram: 1 green, 2 blue, 3 orange. */
const TAPE_TINT: Record<TapeKey, { chip: string; ring: string }> = {
  c: { chip: "bg-[var(--color-tape-1)]", ring: "border-[var(--color-tape-1)]" },
  ss: { chip: "bg-[var(--color-tape-2)]", ring: "border-[var(--color-tape-2)]" },
  ee: { chip: "bg-[var(--color-tape-3)]", ring: "border-[var(--color-tape-3)]" },
};
const EYEBROW =
  "text-micro font-semibold tracking-[0.12em] uppercase text-sage";

export default function CalculatorPage() {
  const patch = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const today = useSyncExternalStore(NEVER_CHANGES, todayISO, noDateOnServer);

  const [measurements, setMeasurements] = useState({ c: "", ss: "", ee: "" });
  const [activeTape, setActiveTape] = useState<TapeKey | null>(null);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [showDate, setShowDate] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const date = pickedDate ?? today;

  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), 1800);
    return () => clearTimeout(timer);
  }, [justSaved]);

  const active = useMemo(
    () => patch.fruits.find((f) => f.id === patch.activeId) ?? patch.fruits[0],
    [patch],
  );

  const reading = useMemo(() => {
    const c = inches(measurements.c);
    const ss = inches(measurements.ss);
    const ee = inches(measurements.ee);
    const ott = totalOtt(c, ss, ee);
    return {
      c,
      ss,
      ee,
      ott,
      lbs: ottWeight(ott),
      taken: [c, ss, ee].filter((v) => v > 0).length,
    };
  }, [measurements]);

  const complete = reading.taken === 3;
  const range = weightRange(reading.lbs);
  const filled: Record<TapeKey, boolean> = {
    c: reading.c > 0,
    ss: reading.ss > 0,
    ee: reading.ee > 0,
  };

  const growth = useMemo(() => {
    const entries = active.entries;
    if (entries.length < 2) return null;
    const previous = entries[entries.length - 2];
    const latest = entries[entries.length - 1];
    const days = daysBetween(previous.date, latest.date);
    const rate = lbPerDay(previous, latest);
    if (rate === null || days <= 0) return null;
    return { rate, days, since: previous.date };
  }, [active]);

  const projection = useMemo(() => {
    const last = active.entries[active.entries.length - 1];
    if (!active.pollinationDate || !last) return null;

    // DAP runs to the measurement's own date so the projection matches the
    // weight it is built from, not whatever today happens to be.
    const dap = daysBetween(active.pollinationDate, last.date);
    const endDap = active.expectedEndDate
      ? daysBetween(active.pollinationDate, active.expectedEndDate)
      : null;

    const result = projectFinalWeight(last.lbs, dap, endDap);
    if (!result) return null;
    return {
      ...result,
      dap,
      endDap,
      clamped: endDap !== null && endDap < MAX_DAP,
    };
  }, [active]);

  const latestMeasurement: LatestMeasurement | null = useMemo(() => {
    const last = active.entries[active.entries.length - 1];
    if (!last) return null;
    return { date: last.date, c: last.c, ss: last.ss, ee: last.ee };
  }, [active]);

  function updateActiveFruit(updater: (fruit: Fruit) => Fruit) {
    writePatch({
      ...getSnapshot(),
      fruits: getSnapshot().fruits.map((f) =>
        f.id === getSnapshot().activeId ? updater(f) : f,
      ),
    });
  }

  function addFruit() {
    const prev = getSnapshot();
    const fruit: Fruit = {
      id: newId(),
      name: `Pumpkin ${prev.fruits.length + 1}`,
      entries: [],
    };
    writePatch({ fruits: [...prev.fruits, fruit], activeId: fruit.id });
  }

  function saveMeasurement() {
    if (!complete) return;
    const entry: Entry = {
      date: date || todayISO(),
      c: reading.c,
      ss: reading.ss,
      ee: reading.ee,
      ott: Number(reading.ott.toFixed(1)),
      lbs: Math.round(reading.lbs),
    };
    updateActiveFruit((fruit) => ({
      ...fruit,
      entries: [...fruit.entries, entry].sort((a, b) => a.date.localeCompare(b.date)),
    }));
    setJustSaved(true);
  }

  function deleteEntry(index: number) {
    updateActiveFruit((fruit) => ({
      ...fruit,
      entries: fruit.entries.filter((_, i) => i !== index),
    }));
  }

  const rows = active.entries
    .map((entry, index) => ({ entry, index, previous: active.entries[index - 1] }))
    .reverse();

  const manyFruit = patch.fruits.length > 1;
  const milestone = complete ? milestoneMessage(reading.lbs) : null;

  return (
    // Bottom padding clears the fixed action bar so nothing sits under it.
    <div className="flex flex-col gap-4 pb-24">
      {/* Chips only exist once there is more than one pumpkin to choose between. */}
      {manyFruit && (
        <div className="flex flex-wrap gap-2">
          {patch.fruits.map((fruit) => {
            const on = fruit.id === patch.activeId;
            return (
              <button
                key={fruit.id}
                type="button"
                onClick={() =>
                  writePatch({ ...getSnapshot(), activeId: fruit.id })
                }
                className={`inline-flex items-center rounded-full border px-4 text-tiny font-medium transition-colors ${
                  on
                    ? "border-gold bg-gold text-ink"
                    : "border-vine-soft text-cream/70 hover:border-gold/60 hover:text-cream"
                }`}
              >
                {fruit.name || "Untitled"}
              </button>
            );
          })}
        </div>
      )}

      <section className={CARD}>
        <h1 className="display-face text-center text-title leading-tight text-vine">
          {manyFruit ? active.name || "Untitled" : "Measure your pumpkin"}
        </h1>
        <p className="mx-auto mt-1 max-w-[30ch] text-center text-tiny leading-relaxed text-sage">
          Run a tape around it three ways. Tap a box to see where that one goes.
        </p>

        <div className="mt-3 flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-cream-edge" />
          <svg viewBox="0 0 20 20" className="h-4 w-4 text-[var(--color-tape-3)]" fill="currentColor">
            <ellipse cx="10" cy="12" rx="7.5" ry="6" />
            <ellipse cx="10" cy="12" rx="2.6" ry="6" fill="#F2A254" opacity=".5" />
            <path d="M9.2 6.4C9 4.6 8.4 3.6 7.4 2.8c1.6-.4 2.8.5 3.3 1.9.5-1 1.4-1.5 2.3-1.3-.9 1-1.4 2-1.5 3z" fill="#2F5A3F" />
          </svg>
          <span className="h-px flex-1 bg-cream-edge" />
        </div>

        <div className="mt-3">
          <PumpkinDiagram active={activeTape} filled={filled} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-cream-edge pt-4">
          <div>
            <label htmlFor="pollination" className="mb-1 block text-tiny text-sage">
              Pollination date
            </label>
            <input
              id="pollination"
              type="date"
              value={active.pollinationDate ?? ""}
              onChange={(e) =>
                updateActiveFruit((fruit) => ({
                  ...fruit,
                  pollinationDate: e.target.value || undefined,
                }))
              }
              className="numerals w-full rounded-xl border-2 border-cream-edge bg-white px-2.5 py-2 text-tiny text-ink"
            />
          </div>
          <div>
            <label htmlFor="end-date" className="mb-1 block text-tiny text-sage">
              Expected end <span className="text-sage/70">(optional)</span>
            </label>
            <input
              id="end-date"
              type="date"
              value={active.expectedEndDate ?? ""}
              onChange={(e) =>
                updateActiveFruit((fruit) => ({
                  ...fruit,
                  expectedEndDate: e.target.value || undefined,
                }))
              }
              className="numerals w-full rounded-xl border-2 border-cream-edge bg-white px-2.5 py-2 text-tiny text-ink"
            />
          </div>
        </div>

        <div className="mt-2">
          {MEASUREMENTS.map((m) => {
            const isActive = activeTape === m.key;
            const isFilled = filled[m.key];
            return (
              <div
                key={m.key}
                className="flex items-center gap-3 border-t border-cream-edge py-2.5 first:border-t-0"
              >
                <span
                  aria-hidden
                  className={`numerals flex h-8 w-8 flex-none items-center justify-center rounded-full text-tiny font-semibold text-cream transition-opacity ${TAPE_TINT[m.key].chip} ${isActive || isFilled ? "opacity-100" : "opacity-70"}`}
                >
                  {m.step}
                </span>

                <label htmlFor={m.key} className="min-w-0 flex-1 cursor-pointer py-1">
                  <span className="block text-small font-semibold text-ink">
                    {m.title}
                  </span>
                  <span className="mt-0.5 block text-tiny leading-snug text-sage">
                    {m.hint}
                  </span>
                </label>

                <span className="flex flex-none items-center gap-1.5">
                  <input
                    id={m.key}
                    inputMode="decimal"
                    placeholder="0"
                    value={measurements[m.key]}
                    onFocus={() => setActiveTape(m.key)}
                    onBlur={() => setActiveTape(null)}
                    onChange={(e) =>
                      setMeasurements((prev) => ({ ...prev, [m.key]: e.target.value }))
                    }
                    className={`numerals w-[76px] rounded-xl border-2 bg-white px-2.5 py-2 text-right text-lead font-semibold text-ink transition-colors ${isActive || isFilled ? TAPE_TINT[m.key].ring : "border-cream-edge"}`}
                  />
                  <span className="text-tiny text-sage">in</span>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className={`${CARD} text-center`}>
        <p className={EYEBROW}>Estimated weight</p>

        <p
          className={`display-face weight-readout mt-1 ${
            complete ? "text-pumpkin" : "text-sage/35"
          }`}
        >
          {complete ? lb(reading.lbs) : "—"}
        </p>

        {complete ? (
          <>
            <p className="numerals mt-1 text-tiny text-sage">
              {lb(range.low)}–{lb(range.high)} lb · {reading.ott.toFixed(1)} in
              total
            </p>
            {milestone && (
              <p className="display-face mt-3 text-base leading-snug font-semibold text-vine">
                {milestone}
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-small leading-relaxed text-sage">
            {reading.taken === 0
              ? "Fill in the three numbers above and the weight appears here."
              : `${3 - reading.taken} more measurement${
                  reading.taken === 2 ? "" : "s"
                } to go.`}
          </p>
        )}
      </section>

      <div className="flex items-center justify-center gap-2 text-tiny text-cream/55">
        {showDate ? (
          <label className="flex items-center gap-2">
            <span>Measured on</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setPickedDate(e.target.value)}
              className="numerals rounded-lg border border-vine-soft bg-vine-deep px-2 py-1 text-tiny text-cream"
            />
          </label>
        ) : (
          <>
            <span>
              Measured {pickedDate && pickedDate !== today ? shortDate(date) : "today"}
            </span>
            <button
              type="button"
              onClick={() => setShowDate(true)}
              className="font-semibold text-gold underline underline-offset-2"
            >
              Change
            </button>
          </>
        )}
      </div>

      <details open={active.entries.length > 0} className="rounded-2xl bg-cream/95">
        <summary className="flex items-center justify-between gap-3 px-5 py-4">
          <span className="display-face text-lead font-semibold text-vine">
            History
          </span>
          <span className="numerals text-tiny text-sage">
            {active.entries.length === 0
              ? "nothing yet"
              : `${active.entries.length} saved`}
          </span>
        </summary>

        <div className="px-5 pb-5">
          {active.entries.length === 0 ? (
            <p className="text-small leading-relaxed text-sage">
              Save your first measurement and it lands here. Measure the same
              three spots each week and you will watch the curve climb — that
              tells you far more than any single weight.
            </p>
          ) : (
            <>
              {growth && (
                <p className="mb-4 rounded-xl bg-vine px-4 py-3 text-cream">
                  <span className="numerals text-title font-semibold text-gold">
                    {growth.rate >= 0 ? "+" : ""}
                    {growth.rate.toFixed(1)}
                  </span>
                  <span className="ml-1.5 text-tiny text-cream/70">lb a day</span>
                  <span className="mt-0.5 block text-tiny text-cream/70">
                    over {growth.days} day{growth.days === 1 ? "" : "s"} since{" "}
                    {shortDate(growth.since)}
                  </span>
                </p>
              )}

              {projection ? (
                <div className="mb-4 rounded-xl bg-vine px-4 py-3 text-cream">
                  <p className={EYEBROW + " text-cream/60"}>
                    Projected final weight
                  </p>
                  <p className="numerals text-title font-semibold text-gold">
                    {roundProjection(projection.projectedLbs).toLocaleString("en-US")}
                    <span className="ml-1.5 text-tiny font-normal text-cream/70">
                      lb
                    </span>
                  </p>
                  <p className="numerals mt-0.5 text-tiny text-cream/70">
                    {roundProjection(
                      projection.projectedLbs * (1 - PROJECTION_TOLERANCE),
                    ).toLocaleString("en-US")}
                    –
                    {roundProjection(
                      projection.projectedLbs * (1 + PROJECTION_TOLERANCE),
                    ).toLocaleString("en-US")}{" "}
                    lb
                  </p>
                  <p className="mt-1.5 text-tiny text-cream/70">
                    Day {projection.dap} after pollination, about{" "}
                    {Math.round(projection.fractionComplete * 100)}% of final
                    weight.
                  </p>
                  {projection.clamped && (
                    <p className="mt-1 text-tiny text-cream/70">
                      Projected to day {projection.endDap} end date, not full
                      maturity.
                    </p>
                  )}
                </div>
              ) : (
                !active.pollinationDate && (
                  <p className="mb-4 text-tiny leading-relaxed text-sage">
                    Add a pollination date to see a projected final weight.
                  </p>
                )
              )}

              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-micro tracking-wider text-sage uppercase">
                    <th className="pb-2 text-left font-semibold">Date</th>
                    <th className="pb-2 text-right font-semibold">Inches</th>
                    <th className="pb-2 text-right font-semibold">Pounds</th>
                    <th className="pb-2 text-right font-semibold">Gain</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ entry, index, previous }) => {
                    const rate = previous ? lbPerDay(previous, entry) : null;
                    return (
                      <tr key={`${entry.date}-${index}`} className="numerals text-small">
                        <td className="border-t border-cream-edge py-2.5 text-left text-sage">
                          {shortDate(entry.date)}
                        </td>
                        <td className="border-t border-cream-edge py-2.5 text-right text-sage">
                          {entry.ott.toFixed(1)}
                        </td>
                        <td className="border-t border-cream-edge py-2.5 text-right font-semibold text-ink">
                          {entry.lbs.toLocaleString("en-US")}
                        </td>
                        <td className="border-t border-cream-edge py-2.5 text-right text-vine">
                          {rate === null
                            ? "—"
                            : `${rate >= 0 ? "+" : ""}${rate.toFixed(1)}`}
                        </td>
                        <td className="border-t border-cream-edge py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => deleteEntry(index)}
                            aria-label={`Remove the ${shortDate(entry.date)} measurement`}
                            className="h-11 w-11 rounded-lg text-tiny text-sage hover:text-pumpkin"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}

          <div className="mt-5 border-t border-cream-edge pt-4">
            <label
              htmlFor="fruit-name"
              className="mb-1.5 block text-tiny font-medium text-sage"
            >
              Name this pumpkin
            </label>
            <input
              id="fruit-name"
              type="text"
              autoComplete="off"
              value={active.name}
              onChange={(e) =>
                updateActiveFruit((fruit) => ({ ...fruit, name: e.target.value }))
              }
              className="w-full rounded-xl border-2 border-cream-edge bg-white px-3.5 py-2.5 text-small text-ink"
            />

            <button
              type="button"
              onClick={addFruit}
              className="mt-3 text-tiny font-semibold text-vine underline underline-offset-2"
            >
              Growing another one? Add a second pumpkin
            </button>
          </div>

          <div className="mt-5 border-t border-cream-edge pt-4">
            <EnterLeaderboard
              fruitName={active.name}
              latest={latestMeasurement}
            />
          </div>
        </div>
      </details>

      {/*
        The primary action never leaves the screen. Fixed rather than sticky so
        it cannot end up floating over the measurement rows halfway down the
        card; the page carries matching bottom padding, and the fade lets
        content scroll out from under it cleanly.
      */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
        <div className="pointer-events-auto mx-auto max-w-[640px] bg-gradient-to-t from-vine from-72% to-transparent px-4 pt-7 pb-4">
          <button
            type="button"
            onClick={saveMeasurement}
            disabled={!complete}
            className="display-face inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-cream px-5 text-lead text-vine shadow-[0_4px_20px_rgba(0,0,0,0.32)] transition-colors disabled:bg-vine-soft disabled:text-cream/45 disabled:shadow-none"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5 flex-none" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 3h9l3 3v11H4z M7 3v5h6V3 M7 17v-5h6v5" />
          </svg>
          {justSaved ? "Saved to your log" : "Save this measurement"}
          </button>
        </div>
      </div>
    </div>
  );
}
