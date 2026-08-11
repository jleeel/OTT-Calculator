"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SOIL_TYPES,
  canopyDefaultIsSafe,
  daysUntilIrrigation,
  inchesToGallons,
  runBalance,
  splitAt,
  type IrrigationEvent,
  type SoilType,
} from "@/lib/irrigation/balance";
import {
  cacheIsFresh,
  fetchEto,
  type EtoCache,
  type EtoDay,
} from "@/lib/irrigation/eto";
import { hasLocation, type PatchSetup } from "@/lib/irrigation/setup";

/**
 * Patch setup and the water balance.
 *
 * The ETo fetch happens here, in the browser, straight to Open-Meteo. That is
 * deliberate: latitude and longitude are the most identifying thing this app
 * touches, and a client-side fetch means the patch location never reaches our
 * server — the same reasoning that keeps the measurement log in localStorage.
 *
 * Everything the balance does is in src/lib/irrigation. This file fetches,
 * caches, and renders.
 */

const ETO_CACHE_KEY = "agoptics-eto-v1";

const FIELD =
  "rounded-xl border border-cream-edge bg-white px-3.5 py-3 text-base text-ink";
const LABEL = "mb-1.5 block text-tiny text-sage";
const CARD = "mb-4 rounded-2xl border border-cream-edge bg-cream p-5";
const HEADING = "mb-3.5 text-xs font-bold tracking-[0.09em] text-vine uppercase";

const SOIL_LABEL: Record<SoilType, string> = {
  sand: "Sand — drains fast, water often",
  loam: "Loam — the middle ground",
  clay: "Clay — holds water, water less often",
};

/**
 * The patch's LOCAL date, not UTC. Open-Meteo is asked for timezone=auto, so
 * the series is in local dates — a UTC "today" runs a day ahead every evening
 * (from 5pm PDT), counting tomorrow's forecast as already spent and defaulting
 * the log's date input to tomorrow.
 */
function todayISO(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function readCache(): EtoCache | null {
  try {
    const raw = window.localStorage.getItem(ETO_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EtoCache;
    return Array.isArray(parsed?.days) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(cache: EtoCache): void {
  try {
    window.localStorage.setItem(ETO_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage full or blocked; the series just refetches next time.
  }
}

type Props = {
  setup: PatchSetup;
  events: IrrigationEvent[];
  pollinationDate: string | null;
  dap: number | null;
  onSetupChange: (setup: PatchSetup) => void;
  onEventsChange: (events: IrrigationEvent[]) => void;
};

export default function Irrigation({
  setup,
  events,
  pollinationDate,
  dap,
  onSetupChange,
  onEventsChange,
}: Props) {
  const [days, setDays] = useState<EtoDay[] | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "stale">("idle");
  const [locating, setLocating] = useState(false);
  const requested = useRef<string>("");

  const { latitude, longitude } = setup;
  const located = hasLocation(setup);

  /**
   * Fetch at most once a day per location. A cached series is used as-is; a
   * failed fetch leaves whatever we already had and marks the card stale
   * rather than emptying it, because a two-day-old ETo is far better than no
   * balance at all.
   */
  useEffect(() => {
    if (latitude === null || longitude === null) return;

    const key = `${latitude},${longitude}`;
    if (requested.current === key) return;
    requested.current = key;

    const controller = new AbortController();

    // All of this sits inside an async function on purpose. Reading the cache
    // and setting state synchronously in the effect body trips React's
    // set-state-in-effect rule, and localStorage cannot be read during render
    // without breaking the server pass.
    const load = async () => {
      const today = todayISO();
      const cached = readCache();

      if (cacheIsFresh(cached, latitude, longitude, today)) {
        setDays(cached!.days);
        setStatus("idle");
        return;
      }

      setStatus("loading");
      try {
        const fresh = await fetchEto(latitude, longitude, controller.signal);
        setDays(fresh);
        setStatus("idle");
        writeCache({ latitude, longitude, fetchedOn: today, days: fresh });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("[irrigation] ETo fetch failed", error);
        // Fall back to whatever is cached, even from another day: a two-day-old
        // reference figure beats no balance at all.
        if (cached?.days?.length) setDays(cached.days);
        setStatus("stale");
      }
    };

    void load();

    return () => controller.abort();
  }, [latitude, longitude]);

  const useMyLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onSetupChange({
          ...setup,
          // Four decimals is about 11 m — plenty for a weather model, and it
          // keeps a precise home address out of localStorage.
          latitude: Number(position.coords.latitude.toFixed(4)),
          longitude: Number(position.coords.longitude.toFixed(4)),
        });
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  }, [setup, onSetupChange]);

  const balance = useMemo(() => {
    if (!days?.length) return null;
    return runBalance({
      days,
      events,
      pollinationDate,
      canopyFraction: setup.canopyPercent / 100,
      soil: setup.soil,
      rootDepthInches: setup.rootDepthInches,
    });
  }, [days, events, pollinationDate, setup]);

  const view = useMemo(() => {
    if (!balance) return null;
    const today = todayISO();
    const { past, forecast } = splitAt(balance.days, today);
    const current = past.length
      ? past[past.length - 1].depletionInches
      : balance.depletionInches;
    const until = daysUntilIrrigation(
      current,
      balance.trigger,
      forecast.map((d) => d.etcInches),
    );
    return {
      current,
      until,
      recent: past.slice(-7),
      ahead: forecast.slice(0, 7),
      trigger: balance.trigger,
      taw: balance.taw,
      missingDays: balance.missingDays,
    };
  }, [balance]);

  function set<K extends keyof PatchSetup>(key: K, value: PatchSetup[K]) {
    onSetupChange({ ...setup, [key]: value });
  }

  return (
    <>
      <details className="mb-4 rounded-2xl border border-cream-edge bg-cream">
        <summary className="flex items-center justify-between p-5">
          <span className={`${HEADING} mb-0`}>Patch setup</span>
          <span className="text-tiny text-sage">
            {located ? "Change" : "Set up watering"}
          </span>
        </summary>

        <div className="border-t border-cream-edge p-5 pt-4">
          <p className="mb-4 text-tiny leading-[1.6] text-sage">
            Watering advice needs to know where the patch is and what it is
            growing in. This stays in your browser and is sent only to the
            weather service, never to us.
          </p>

          <div className="mb-3.5 flex gap-2.5">
            <div className="flex-1">
              <label className={LABEL} htmlFor="lat">
                Latitude
              </label>
              <input
                id="lat"
                inputMode="decimal"
                className={`${FIELD} numerals w-full`}
                value={latitude ?? ""}
                placeholder="36.2077"
                onChange={(e) =>
                  set("latitude", e.target.value === "" ? null : Number(e.target.value))
                }
              />
            </div>
            <div className="flex-1">
              <label className={LABEL} htmlFor="lon">
                Longitude
              </label>
              <input
                id="lon"
                inputMode="decimal"
                className={`${FIELD} numerals w-full`}
                value={longitude ?? ""}
                placeholder="-119.3473"
                onChange={(e) =>
                  set("longitude", e.target.value === "" ? null : Number(e.target.value))
                }
              />
            </div>
          </div>

          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="mb-4 w-full cursor-pointer rounded-xl border-2 border-vine bg-transparent px-5 text-small font-semibold text-vine transition-colors hover:bg-vine hover:text-cream disabled:border-cream-edge disabled:text-sage"
          >
            {locating ? "Finding you…" : "Use my location"}
          </button>

          <div className="mb-3.5">
            <label className={LABEL} htmlFor="soil">
              Soil
            </label>
            <select
              id="soil"
              className={`${FIELD} w-full`}
              value={setup.soil}
              onChange={(e) => set("soil", e.target.value as SoilType)}
            >
              {SOIL_TYPES.map((soil) => (
                <option key={soil} value={soil}>
                  {SOIL_LABEL[soil]}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3.5 flex gap-2.5">
            <div className="flex-1">
              <label className={LABEL} htmlFor="area">
                Patch area <span className="text-sage">(sq ft)</span>
              </label>
              <input
                id="area"
                inputMode="numeric"
                className={`${FIELD} numerals w-full`}
                value={setup.patchAreaSqFt ?? ""}
                placeholder="400"
                onChange={(e) =>
                  set(
                    "patchAreaSqFt",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              />
            </div>
            <div className="flex-1">
              <label className={LABEL} htmlFor="root">
                Root depth <span className="text-sage">(in)</span>
              </label>
              <input
                id="root"
                inputMode="numeric"
                className={`${FIELD} numerals w-full`}
                value={setup.rootDepthInches}
                onChange={(e) => set("rootDepthInches", Number(e.target.value) || 18)}
              />
            </div>
          </div>

          <label className={LABEL} htmlFor="canopy">
            Leaf covering the patch —{" "}
            <span className="numerals font-semibold text-vine">
              {setup.canopyPercent}%
            </span>
          </label>
          <input
            id="canopy"
            type="range"
            min={10}
            max={100}
            step={5}
            value={setup.canopyPercent}
            onChange={(e) => set("canopyPercent", Number(e.target.value))}
            className="w-full accent-[color:var(--color-pumpkin)]"
          />
          <p className="mt-1 text-tiny leading-[1.6] text-sage">
            {canopyDefaultIsSafe(dap)
              ? "Past day 30 a healthy plant has covered its patch, so 100% is usually right."
              : "Bare ground between the vines uses far less water than leaf does. Early on, drag this down to roughly what the plant actually shades."}
          </p>
        </div>
      </details>

      {located && (
        <section className={CARD}>
          <div className="mb-3.5 flex items-baseline justify-between gap-3">
            <h2 className={`${HEADING} mb-0`}>Water</h2>
            {status === "loading" && (
              <span className="text-tiny text-sage">Getting weather…</span>
            )}
            {status === "stale" && (
              <span className="text-tiny text-sage">
                Weather unavailable — showing the last figures
              </span>
            )}
          </div>

          {!view ? (
            <p className="text-small leading-relaxed text-sage">
              {status === "loading"
                ? "Fetching reference evapotranspiration for your patch."
                : "No weather data yet for this location. It will fill in once the forecast loads."}
            </p>
          ) : (
            <>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="numerals text-hero leading-none font-bold text-vine">
                    {view.current.toFixed(2)}
                    <span className="text-lead font-semibold text-sage"> in</span>
                  </div>
                  <div className="mt-1 text-tiny text-sage">
                    used since the last full watering
                  </div>
                </div>
                <div className="text-right">
                  <div className="numerals text-title leading-none font-bold text-pumpkin">
                    {view.trigger > 0
                      ? Math.round((view.current / view.trigger) * 100)
                      : 0}
                    %
                  </div>
                  <div className="mt-1 text-tiny text-sage">of the way to dry</div>
                </div>
              </div>

              <Bar current={view.current} trigger={view.trigger} taw={view.taw} />

              <p className="mt-3 text-small leading-relaxed text-ink">
                {view.until === 0 ? (
                  <strong className="text-pumpkin">Water it now.</strong>
                ) : view.until === null ? (
                  <>Not due inside the next week on this forecast.</>
                ) : (
                  <>
                    Water in about{" "}
                    <strong className="numerals">{view.until}</strong>{" "}
                    {view.until === 1 ? "day" : "days"}.
                  </>
                )}{" "}
                <span className="text-sage">
                  Refilling the root zone takes about{" "}
                  <span className="numerals">{view.trigger.toFixed(2)} in</span>
                  {setup.patchAreaSqFt
                    ? `, roughly ${Math.round(
                        inchesToGallons(view.trigger, setup.patchAreaSqFt),
                      ).toLocaleString("en-US")} gallons over this patch.`
                    : "."}
                </span>
              </p>

              {!pollinationDate && (
                <p className="mt-2 rounded-xl bg-cream-dim px-3.5 py-2.5 text-tiny leading-[1.6] text-ink">
                  No pollination date set, so this assumes an early-season
                  plant and uses the lowest crop factor there is. A plant in
                  full run uses close to twice this. Add the date above and the
                  figures follow the plant.
                </p>
              )}

              {view.missingDays > 0 && (
                <p className="mt-2 text-tiny text-sage">
                  {view.missingDays === 1
                    ? "One day in this window had no weather reading and was"
                    : `${view.missingDays} days in this window had no weather reading and were`}{" "}
                  counted as using nothing, so the real figure is a little
                  higher.
                </p>
              )}

              <RecentEt days={view.recent} ahead={view.ahead} />

              <p className="mt-3 text-micro leading-[1.5] text-sage">
                Reference evapotranspiration for{" "}
                <span className="numerals">
                  {latitude?.toFixed(3)}, {longitude?.toFixed(3)}
                </span>{" "}
                from Open-Meteo, updated once a day. Crop use is that figure
                scaled by the plant&rsquo;s stage and how much of the patch its
                leaf covers.
              </p>
            </>
          )}

          <IrrigationLog
            events={events}
            areaSqFt={setup.patchAreaSqFt}
            onChange={onEventsChange}
          />
        </section>
      )}
    </>
  );
}

/** Depletion against the trigger, with the trigger marked rather than implied. */
function Bar({
  current,
  trigger,
  taw,
}: {
  current: number;
  trigger: number;
  taw: number;
}) {
  // Scale to the whole root zone so the trigger sits where it really sits —
  // halfway — rather than always filling the bar.
  const span = Math.max(taw, current, 0.01);
  const fill = Math.min(100, (current / span) * 100);
  const mark = Math.min(100, (trigger / span) * 100);
  const past = current >= trigger;

  return (
    <div className="mt-4">
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-cream-dim">
        <div
          className={`h-full rounded-full ${past ? "bg-pumpkin" : "bg-vine"}`}
          style={{ width: `${fill}%` }}
        />
        <div
          className="absolute top-0 h-full w-0.5 bg-ink/60"
          style={{ left: `${mark}%` }}
          aria-hidden
        />
      </div>
      <div className="mt-1 flex justify-between text-micro text-sage">
        <span>Full</span>
        <span>Water here</span>
        <span>Dry</span>
      </div>
    </div>
  );
}

type EtRow = { date: string; etcInches: number };

/**
 * What the plant used, and what it is forecast to use.
 *
 * The forecast half was being computed and used for "water in N days" but never
 * shown, so there was nothing on screen to say the card knew where the patch
 * was. The days ahead are the location-based part, so they are the part worth
 * displaying.
 */
function RecentEt({ days, ahead }: { days: EtRow[]; ahead: EtRow[] }) {
  if (days.length === 0 && ahead.length === 0) return null;
  const peak = Math.max(
    ...days.map((d) => d.etcInches),
    ...ahead.map((d) => d.etcInches),
    0.01,
  );

  const row = (day: EtRow, dim: boolean) => (
    <li key={day.date} className="flex items-center gap-2.5 py-1">
      <span className="numerals w-11 flex-none text-micro text-sage">
        {day.date.slice(5)}
      </span>
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-cream-dim">
        <span
          className={`block h-full rounded-full ${dim ? "bg-gold/45" : "bg-gold"}`}
          style={{ width: `${(day.etcInches / peak) * 100}%` }}
        />
      </span>
      <span className="numerals w-14 flex-none text-right text-micro text-sage">
        {day.etcInches.toFixed(2)} in
      </span>
    </li>
  );

  return (
    <div className="mt-4 border-t border-cream-edge pt-3">
      {days.length > 0 && (
        <>
          <div className="mb-2 text-tiny font-semibold text-vine">
            What the plant used
          </div>
          <ul>{days.map((d) => row(d, false))}</ul>
        </>
      )}

      {ahead.length > 0 && (
        <>
          <div className="mt-3 mb-2 text-tiny font-semibold text-vine">
            What the forecast says it will use
          </div>
          <ul>{ahead.map((d) => row(d, true))}</ul>
        </>
      )}
    </div>
  );
}

/** Log a watering. Flood is a full refill by default, which is what it is. */
function IrrigationLog({
  events,
  areaSqFt,
  onChange,
}: {
  events: IrrigationEvent[];
  areaSqFt: number | null;
  onChange: (events: IrrigationEvent[]) => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [mode, setMode] = useState<"refill" | "inches">("refill");
  const [inches, setInches] = useState("");

  function add() {
    const amount = Number.parseFloat(inches);
    const event: IrrigationEvent =
      mode === "refill"
        ? { id: `${date}-${Date.now()}`, date, kind: "refill" }
        : {
            id: `${date}-${Date.now()}`,
            date,
            kind: "inches",
            inches: amount,
          };
    if (mode === "inches" && (!Number.isFinite(amount) || amount <= 0)) return;

    onChange([...events, event].sort((a, b) => a.date.localeCompare(b.date)));
    setInches("");
  }

  const recent = [...events].slice(-5).reverse();

  return (
    <div className="mt-4 border-t border-cream-edge pt-4">
      <div className="mb-2.5 text-tiny font-semibold text-vine">
        Log a watering
      </div>

      {/*
        Stacked, not side by side. A date input plus a select with long option
        text overflowed a 375px screen — flex items default to min-width:auto,
        so the select would not shrink below its longest option.
      */}
      <div className="mb-2.5 grid gap-2.5">
        <input
          type="date"
          aria-label="Date watered"
          className={`${FIELD} numerals w-full`}
          value={date}
          max={todayISO()}
          onChange={(e) => setDate(e.target.value)}
        />
        <select
          aria-label="How much water"
          className={`${FIELD} w-full min-w-0`}
          value={mode}
          onChange={(e) => setMode(e.target.value as "refill" | "inches")}
        >
          <option value="refill">Soaked it right through</option>
          <option value="inches">A measured amount</option>
        </select>
      </div>

      {mode === "inches" && (
        <div className="mb-2.5">
          <input
            inputMode="decimal"
            aria-label="Inches applied"
            className={`${FIELD} numerals w-full`}
            value={inches}
            placeholder="Inches applied, e.g. 0.5"
            onChange={(e) => setInches(e.target.value)}
          />
          {areaSqFt && Number.parseFloat(inches) > 0 && (
            <p className="mt-1 text-tiny text-sage">
              About{" "}
              {Math.round(
                inchesToGallons(Number.parseFloat(inches), areaSqFt),
              ).toLocaleString("en-US")}{" "}
              gallons over this patch.
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={add}
        className="w-full cursor-pointer rounded-xl bg-gold p-3.5 text-small font-bold text-ink"
      >
        Save watering
      </button>

      {recent.length > 0 && (
        <ul className="mt-3">
          {recent.map((event) => (
            <li
              key={event.id}
              className="flex items-center justify-between gap-3 border-t border-cream-edge py-2 text-tiny first:border-t-0"
            >
              <span className="numerals text-sage">{event.date}</span>
              <span className="flex-1 text-ink">
                {event.kind === "refill"
                  ? "Soaked through"
                  : `${event.inches} in`}
              </span>
              <button
                type="button"
                onClick={() => onChange(events.filter((e) => e.id !== event.id))}
                className="cursor-pointer text-tiny font-semibold text-sage hover:text-vine"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
