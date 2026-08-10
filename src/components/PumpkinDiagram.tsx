"use client";

/**
 * The teaching element. Three tape paths drawn over a pumpkin in three-quarter
 * view, so a first-year grower can see which wrap each measurement means.
 *
 * Focused input  -> its tape draws in and highlights in pumpkin orange
 * Already filled -> persistent gold path
 * Neither        -> quiet sage
 *
 * Each tape sits on a cream casing stroke so it reads as lying on the fruit
 * rather than merging into the ribs beneath it — without that, the quiet state
 * is indistinguishable from the pumpkin's own lines.
 *
 * The draw animation is a CSS keyframe on a keyed element, so refocusing an
 * input replays it. `prefers-reduced-motion` collapses the duration globally
 * (see globals.css), leaving the highlight without the draw.
 */

export type TapeKey = "c" | "ss" | "ee";

type Props = {
  active: TapeKey | null;
  filled: Record<TapeKey, boolean>;
};

const TAPES: {
  key: TapeKey;
  label: string;
  /** The part of the wrap you can see. */
  front: string;
  /** The part that passes behind the fruit, drawn faint and dashed. */
  behind?: string;
  /** Sits directly on the path, at an uncrowded point. */
  chip: [number, number];
}[] = [
  {
    key: "ss",
    label: "2",
    front: "M 94 206 C 80 150, 112 88, 166 88 C 220 88, 240 152, 226 206",
    // t≈0.3 along the descending limb — clear of the stem and the silhouette.
    chip: [205, 103],
  },
  {
    key: "ee",
    label: "3",
    front: "M 130 215 C 102 188, 100 118, 146 92",
    behind: "M 146 92 C 194 68, 240 100, 246 142",
    chip: [107, 152],
  },
  {
    key: "c",
    label: "1",
    front: "M 66 152 C 74 178, 112 191, 158 191 C 204 191, 242 178, 250 152",
    behind: "M 66 152 C 74 126, 112 113, 158 113 C 204 113, 242 126, 250 152",
    chip: [158, 191],
  },
];

const RIBS = [
  "M 152 94 Q 98 128, 97 166",
  "M 152 94 Q 121 132, 123 187",
  "M 152 94 Q 157 142, 161 197",
  "M 152 94 Q 199 136, 207 185",
  "M 152 94 Q 231 128, 235 160",
];

type State = "active" | "filled" | "idle";

function tapeColor(state: State): string {
  if (state === "active") return "var(--color-pumpkin)";
  if (state === "filled") return "var(--color-gold)";
  return "var(--color-sage)";
}

export default function PumpkinDiagram({ active, filled }: Props) {
  return (
    <svg
      viewBox="0 0 320 244"
      className="mx-auto block max-h-[220px] w-full"
      role="img"
      aria-label="A pumpkin with the three tape measurements drawn over it: a band around the widest point, a wrap from the ground over the top and back down across the vine, and a wrap from the ground over the top from stem to blossom."
    >
      <line
        x1="12" y1="219" x2="308" y2="219"
        stroke="var(--color-sage)" strokeOpacity="0.5"
        strokeWidth="1.5" strokeLinecap="round"
      />
      <ellipse cx="158" cy="218" rx="80" ry="8" fill="var(--color-ink)" opacity="0.12" />

      {/* stem */}
      <path
        d="M 146 98 C 143 78, 139 66, 130 54 C 140 50, 150 58, 154 70
           C 158 60, 166 55, 173 58 C 165 70, 160 84, 159 98 Z"
        fill="var(--color-vine)"
      />

      {/* body */}
      <path
        d="M 66 152 C 66 112, 106 86, 158 86 C 210 86, 250 112, 250 152
           C 250 192, 210 218, 158 218 C 106 218, 66 192, 66 152 Z"
        fill="var(--color-gold)" fillOpacity="0.45"
        stroke="var(--color-vine)" strokeOpacity="0.45" strokeWidth="2.5"
      />
      {/* light coming from the upper left, so it reads as round */}
      <ellipse
        cx="126" cy="128" rx="42" ry="26"
        fill="var(--color-cream)" opacity="0.30"
      />

      {RIBS.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke="var(--color-vine)"
          strokeOpacity="0.16"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      ))}

      {TAPES.map((tape) => {
        const state: State =
          active === tape.key ? "active" : filled[tape.key] ? "filled" : "idle";
        const color = tapeColor(state);
        const width = state === "active" ? 4.5 : state === "filled" ? 3.6 : 2.6;

        return (
          <g key={tape.key}>
            {tape.behind && (
              <path
                d={tape.behind}
                fill="none"
                stroke={color}
                strokeOpacity={state === "idle" ? 0.32 : 0.45}
                strokeWidth={width * 0.7}
                strokeDasharray="5 7"
                strokeLinecap="round"
              />
            )}

            {/* casing: lifts the tape off the ribs in every state */}
            <path
              d={tape.front}
              fill="none"
              stroke="var(--color-cream)"
              strokeOpacity="0.85"
              strokeWidth={width + 3.5}
              strokeLinecap="round"
            />
            <path
              key={`${tape.key}-${state}`}
              d={tape.front}
              fill="none"
              stroke={color}
              strokeOpacity={state === "idle" ? 0.85 : 1}
              strokeWidth={width}
              strokeLinecap="round"
              pathLength={1}
              className={state === "active" ? "tape-draw" : undefined}
            />

            <circle
              cx={tape.chip[0]} cy={tape.chip[1]} r="11.5"
              fill={state === "idle" ? "var(--color-cream)" : color}
              stroke={state === "idle" ? "var(--color-sage)" : color}
              strokeWidth="2"
            />
            <text
              x={tape.chip[0]} y={tape.chip[1]}
              textAnchor="middle" dominantBaseline="central"
              fontSize="12.5" fontWeight="600"
              fill={state === "idle" ? "var(--color-sage)" : "var(--color-cream)"}
              fontFamily="var(--font-mono)"
            >
              {tape.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
