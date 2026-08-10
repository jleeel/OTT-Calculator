/**
 * Per-fruit irrigation setup, and the validators that let it live in the same
 * localStorage blob as everything else.
 *
 * Storage can hold anything a previous version wrote, so nothing here trusts
 * what it reads. A fruit saved before irrigation existed has no `irrigation`
 * key at all, and must load unchanged — same discipline the projection fields
 * follow.
 *
 * Pure.
 */

import {
  DEFAULT_ROOT_DEPTH_INCHES,
  SOIL_AWC_IN_PER_FT,
  type IrrigationEvent,
  type SoilType,
} from "./balance";

export const DEFAULT_CANOPY_PERCENT = 100;

export type PatchSetup = {
  latitude: number | null;
  longitude: number | null;
  soil: SoilType;
  patchAreaSqFt: number | null;
  rootDepthInches: number;
  canopyPercent: number;
};

export const DEFAULT_SETUP: PatchSetup = {
  latitude: null,
  longitude: null,
  soil: "loam",
  patchAreaSqFt: null,
  rootDepthInches: DEFAULT_ROOT_DEPTH_INCHES,
  canopyPercent: DEFAULT_CANOPY_PERCENT,
};

export type IrrigationState = {
  setup: PatchSetup;
  events: IrrigationEvent[];
};

function isSoil(value: unknown): value is SoilType {
  return typeof value === "string" && value in SOIL_AWC_IN_PER_FT;
}

function finiteOrNull(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

/** ETo without a location is meaningless, so this is what "set up" means. */
export function hasLocation(setup: PatchSetup): boolean {
  return setup.latitude !== null && setup.longitude !== null;
}

export function parseSetup(raw: unknown): PatchSetup {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_SETUP };
  const s = raw as Record<string, unknown>;

  const rootDepth = finiteOrNull(s.rootDepthInches, 1, 120);
  const canopy = finiteOrNull(s.canopyPercent, 0, 100);

  return {
    latitude: finiteOrNull(s.latitude, -90, 90),
    longitude: finiteOrNull(s.longitude, -180, 180),
    soil: isSoil(s.soil) ? s.soil : DEFAULT_SETUP.soil,
    patchAreaSqFt: finiteOrNull(s.patchAreaSqFt, 1, 1_000_000),
    rootDepthInches: rootDepth ?? DEFAULT_SETUP.rootDepthInches,
    canopyPercent: canopy ?? DEFAULT_SETUP.canopyPercent,
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseEvents(raw: unknown): IrrigationEvent[] {
  if (!Array.isArray(raw)) return [];

  const events: IrrigationEvent[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const e = item as Record<string, unknown>;

    if (typeof e.date !== "string" || !ISO_DATE.test(e.date)) continue;
    const id = typeof e.id === "string" && e.id ? e.id : `${e.date}-${events.length}`;

    if (e.kind === "refill") {
      events.push({ id, date: e.date, kind: "refill" });
      continue;
    }
    if (
      e.kind === "inches" &&
      typeof e.inches === "number" &&
      Number.isFinite(e.inches) &&
      e.inches > 0
    ) {
      events.push({ id, date: e.date, kind: "inches", inches: e.inches });
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Read the stored blob. Returns null when the fruit predates irrigation, so
 * the caller can leave the key absent rather than writing defaults back over
 * every fruit the grower owns.
 */
export function parseIrrigation(raw: unknown): IrrigationState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const i = raw as Record<string, unknown>;
  return {
    setup: parseSetup(i.setup),
    events: parseEvents(i.events),
  };
}
