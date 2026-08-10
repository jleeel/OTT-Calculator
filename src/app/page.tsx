"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { daysBetween, lbPerDay, ottWeight, totalOtt, weightRange } from "@/lib/ott";

/**
 * The personal measurement log lives in this browser and never leaves the
 * device. Submitting to the leaderboard is a separate, deliberate action that
 * goes to Supabase.
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
};

type Patch = {
  fruits: Fruit[];
  activeId: string;
};

const MEASUREMENTS = [
  {
    key: "c",
    title: "Circumference",
    hint: "Widest point, tape level with the ground",
  },
  {
    key: "ss",
    title: "Side to side",
    hint: "Ground to ground, across the vine",
  },
  {
    key: "ee",
    title: "End to end",
    hint: "Ground to ground, stem to blossom",
  },
] as const;

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
 * localStorage as an external store.
 *
 * useSyncExternalStore is what makes this hydration-safe without a mount
 * effect: the server and the first client render both get SERVER_SNAPSHOT,
 * then React swaps in the real stored patch. Listening to the `storage`
 * event also keeps two open tabs on the same patch for free.
 *
 * The snapshot must be referentially stable between actual changes, so the
 * parsed patch is cached and only rebuilt when the raw string differs.
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
  // key === null means the whole store was cleared.
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
  // Once storage has thrown (private browsing, quota, locked-down device) the
  // in-memory copy becomes the source of truth for the rest of the session.
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

/**
 * Today's date is external state too — the clock. The server has no useful
 * answer, so it renders blank and hydration fills it in. The input does not
 * need to track the clock ticking over midnight, hence the no-op subscribe.
 */
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

const CARD = "mb-4 rounded-[14px] border border-line bg-card p-5";
const CARD_TITLE = "mb-3.5 text-xs font-bold tracking-[0.09em] uppercase text-blue";
// Width deliberately left off the base: Tailwind resolves conflicting width
// utilities by stylesheet order, not by the order they appear in className,
// so callers set their own instead of trying to override a `w-full` here.
const FIELD =
  "rounded-[10px] border border-line bg-white px-3.5 py-3 text-base text-ink focus:outline-2 focus:outline-blue focus:-outline-offset-1";

export default function CalculatorPage() {
  const patch = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const today = useSyncExternalStore(NEVER_CHANGES, todayISO, noDateOnServer);

  const [measurements, setMeasurements] = useState({ c: "", ss: "", ee: "" });
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [justLogged, setJustLogged] = useState(false);

  const date = pickedDate ?? today;

  useEffect(() => {
    if (!justLogged) return;
    const timer = setTimeout(() => setJustLogged(false), 1600);
    return () => clearTimeout(timer);
  }, [justLogged]);

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

  function updatePatch(updater: (prev: Patch) => Patch) {
    writePatch(updater(getSnapshot()));
  }

  function updateActiveFruit(updater: (fruit: Fruit) => Fruit) {
    updatePatch((prev) => ({
      ...prev,
      fruits: prev.fruits.map((f) => (f.id === prev.activeId ? updater(f) : f)),
    }));
  }

  function addFruit() {
    updatePatch((prev) => {
      const fruit: Fruit = {
        id: newId(),
        name: `Pumpkin ${prev.fruits.length + 1}`,
        entries: [],
      };
      return { fruits: [...prev.fruits, fruit], activeId: fruit.id };
    });
  }

  function logMeasurement() {
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
    setJustLogged(true);
  }

  function deleteEntry(index: number) {
    updateActiveFruit((fruit) => ({
      ...fruit,
      entries: fruit.entries.filter((_, i) => i !== index),
    }));
  }

  // Newest first, but each row still needs the entry before it to show the gain.
  const rows = active.entries
    .map((entry, index) => ({ entry, index, previous: active.entries[index - 1] }))
    .reverse();

  return (
    <>
      <section className={CARD}>
        <h2 className={CARD_TITLE}>Your patch</h2>
        <div className="mb-3.5 flex flex-wrap gap-2">
          {patch.fruits.map((fruit) => {
            const on = fruit.id === patch.activeId;
            return (
              <button
                key={fruit.id}
                type="button"
                onClick={() => updatePatch((prev) => ({ ...prev, activeId: fruit.id }))}
                className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-semibold ${
                  on
                    ? "border-navy bg-navy text-white"
                    : "border-line bg-white text-muted hover:border-muted"
                }`}
              >
                {fruit.name || "Untitled"}
              </button>
            );
          })}
          <button
            type="button"
            onClick={addFruit}
            className="cursor-pointer rounded-full border border-dashed border-blue bg-white px-4 py-2 text-sm font-semibold text-blue"
          >
            + Add pumpkin
          </button>
        </div>

        <label htmlFor="pname" className="mb-1.5 block text-[13px] text-muted">
          Pumpkin name
        </label>
        <input
          id="pname"
          type="text"
          autoComplete="off"
          value={active.name}
          onChange={(e) =>
            updateActiveFruit((fruit) => ({ ...fruit, name: e.target.value }))
          }
          className={`${FIELD} w-full`}
        />
      </section>

      <section className={CARD}>
        <h2 className={CARD_TITLE}>Measurements (inches)</h2>
        {MEASUREMENTS.map((m, i) => (
          <div
            key={m.key}
            className="flex items-center gap-3 border-b border-line py-3.5 last:border-b-0"
          >
            <div className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-blue-soft text-[13px] font-bold text-blue">
              {i + 1}
            </div>
            <label htmlFor={m.key} className="min-w-0 flex-1 cursor-pointer">
              <strong className="block text-[15px] font-semibold">{m.title}</strong>
              <span className="mt-0.5 block text-[12.5px] leading-[1.35] text-muted">
                {m.hint}
              </span>
            </label>
            <div className="flex flex-none items-center gap-1.5">
              <input
                id={m.key}
                inputMode="decimal"
                placeholder="0"
                value={measurements[m.key]}
                onChange={(e) =>
                  setMeasurements((prev) => ({ ...prev, [m.key]: e.target.value }))
                }
                className="w-[82px] rounded-[10px] border border-line px-2.5 py-[11px] text-right text-xl font-semibold text-ink tabular-nums focus:outline-2 focus:outline-blue focus:-outline-offset-1"
              />
              <span className="text-[13px] text-muted">in</span>
            </div>
          </div>
        ))}
      </section>

      <section className={CARD}>
        <h2 className={CARD_TITLE}>Results</h2>

        <div className="mb-3 flex gap-3">
          <div className="flex-1 rounded-[11px] bg-shell px-[15px] py-[13px]">
            <div className="text-[12.5px] text-muted">Total OTT</div>
            <div className="mt-0.5 text-[21px] font-bold tabular-nums">
              {reading.ott.toFixed(1)}&quot;
            </div>
          </div>
          <div className="flex-1 rounded-[11px] bg-shell px-[15px] py-[13px]">
            <div className="text-[12.5px] text-muted">Measurements</div>
            <div className="mt-0.5 text-[21px] font-bold tabular-nums">
              {reading.taken} of 3
            </div>
          </div>
        </div>

        <div
          className={`mb-3.5 rounded-[11px] px-[19px] py-[17px] ${
            complete ? "bg-blue-soft" : "bg-shell"
          }`}
        >
          <div className={`text-[13px] font-bold ${complete ? "text-blue" : "text-muted"}`}>
            Estimated weight
          </div>
          <div
            className={`mt-1 text-[44px] leading-[1.05] font-extrabold tabular-nums ${
              complete ? "text-navy" : "text-[#c3c9d2]"
            }`}
          >
            {complete ? lb(reading.lbs) : "—"}
            <small className="ml-[5px] text-lg font-bold">lb</small>
          </div>
          <div className={`mt-[5px] text-[13px] ${complete ? "text-blue" : "text-muted"}`}>
            {complete
              ? `range ${lb(range.low)} to ${lb(range.high)} lb (±5%)`
              : "Enter all three measurements"}
          </div>
        </div>

        <div className="flex gap-2.5">
          <input
            type="date"
            aria-label="Measurement date"
            value={date}
            onChange={(e) => setPickedDate(e.target.value)}
            className={`${FIELD} w-[150px] flex-none text-[15px]`}
          />
          <button
            type="button"
            onClick={logMeasurement}
            disabled={!complete}
            className="flex-1 cursor-pointer rounded-[10px] bg-navy p-3.5 text-[15px] font-bold text-white disabled:cursor-default disabled:bg-[#cfd5de]"
          >
            {justLogged ? "Logged" : "Log measurement"}
          </button>
        </div>
      </section>

      {growth && (
        <section className={CARD}>
          <h2 className={CARD_TITLE}>Growth</h2>
          <div className="rounded-[11px] bg-green-soft px-[18px] py-4">
            <div className="text-[13px] font-bold text-green">Latest gain</div>
            <div className="mt-[3px] text-[32px] font-extrabold text-green tabular-nums">
              {growth.rate >= 0 ? "+" : ""}
              {growth.rate.toFixed(1)}
              <small className="ml-[5px] text-[15px] font-bold">lb/day</small>
            </div>
            <div className="mt-[3px] text-[12.5px] text-green/85">
              Over {growth.days} day{growth.days === 1 ? "" : "s"} since{" "}
              {shortDate(growth.since)}
            </div>
          </div>
        </section>
      )}

      <section className={CARD}>
        <h2 className={CARD_TITLE}>Measurement log · {active.name || "Untitled"}</h2>

        {rows.length === 0 ? (
          <p className="mt-1 text-sm leading-relaxed text-muted">
            No measurements yet. Take the three numbers above and log them.
            Measuring the same spots each week tells you more than any single
            weight.
          </p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="pb-[9px] text-left text-[11.5px] font-bold tracking-[0.06em] text-muted uppercase">
                  Date
                </th>
                <th className="pb-[9px] text-right text-[11.5px] font-bold tracking-[0.06em] text-muted uppercase">
                  OTT
                </th>
                <th className="pb-[9px] text-right text-[11.5px] font-bold tracking-[0.06em] text-muted uppercase">
                  Weight (lb)
                </th>
                <th className="pb-[9px]" />
                <th className="pb-[9px]" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ entry, index, previous }) => {
                const rate = previous ? lbPerDay(previous, entry) : null;
                return (
                  <tr key={`${entry.date}-${index}`}>
                    <td className="border-t border-line py-3 text-sm text-muted">
                      {shortDate(entry.date)}
                    </td>
                    <td className="border-t border-line py-3 text-right text-[15px] text-muted tabular-nums">
                      {entry.ott.toFixed(1)}&quot;
                    </td>
                    <td className="border-t border-line py-3 text-right text-[15px] font-bold tabular-nums">
                      {entry.lbs.toLocaleString("en-US")}
                    </td>
                    <td className="border-t border-line py-3 text-right text-sm font-semibold text-green tabular-nums">
                      {rate === null ? "" : `${rate >= 0 ? "+" : ""}${rate.toFixed(1)}/day`}
                    </td>
                    <td className="w-[30px] border-t border-line py-3">
                      <button
                        type="button"
                        onClick={() => deleteEntry(index)}
                        aria-label={`Delete ${shortDate(entry.date)} entry`}
                        className="h-[26px] w-[26px] cursor-pointer rounded-[7px] border border-line bg-white text-[13px] leading-none text-muted hover:text-ink"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <p className="px-1 pt-1 text-xs leading-[1.6] text-muted">
        Weight from the 2025 GPC Atlantic Giant OTT table formula. Estimates run
        about ±5% and assume Atlantic Giant genetics; wall thickness drives
        heavy-to-chart or light-to-chart and cannot be measured from the outside.
        Measure the same spots each week for a clean growth curve. Your log saves
        in this browser and stays on your device.
      </p>
    </>
  );
}
