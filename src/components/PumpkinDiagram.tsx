"use client";

/**
 * The teaching element. Three tape paths drawn over a pumpkin, so a first-year
 * grower can see which wrap each measurement means.
 *
 * Focused input  -> its tape draws in and highlights in pumpkin orange
 * Already filled -> persistent gold path
 * Neither        -> quiet sage
 *
 * On the drawing itself: the body is built from six overlapping lobe ellipses
 * rather than one outline, which gives a genuinely bumpy silhouette and turns
 * the overlaps into ribs for free. The lobes are deliberately NOT mirrored —
 * they narrow toward the right to read as three-quarter view, and the tones
 * step darker the same way for a single light source up and to the left. The
 * proportions are Atlantic Giant: wide, squat, heavy in the shoulders, nothing
 * like the tall jack-o-lantern shape.
 *
 * Every tape rides on a cream casing stroke so it reads as lying on the fruit
 * instead of merging into the ribs beneath it.
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

/** Front-left catches the light; tone steps down toward the shaded right. */
const LOBES: { cx: number; cy: number; rx: number; ry: number; fill: string }[] = [
  { cx: 74, cy: 161, rx: 28, ry: 53, fill: "#E9A937" },
  { cx: 110, cy: 156, rx: 35, ry: 58, fill: "#F3B950" },
  { cx: 153, cy: 154, rx: 39, ry: 60, fill: "#EFAF41" },
  { cx: 197, cy: 158, rx: 33, ry: 56, fill: "#E29F31" },
  { cx: 234, cy: 164, rx: 25, ry: 50, fill: "#D69227" },
  { cx: 253, cy: 170, rx: 17, ry: 44, fill: "#C8851F" },
];

const TAPES: {
  key: TapeKey;
  label: string;
  front: string;
  behind?: string;
  chip: [number, number];
}[] = [
  {
    key: "ss",
    label: "2",
    front: "M 74 210 C 54 152, 96 94, 170 94 C 236 96, 264 154, 246 210",
    chip: [225, 114],
  },
  {
    key: "ee",
    label: "3",
    front: "M 126 213 C 88 186, 84 118, 142 96",
    behind: "M 142 96 C 206 74, 258 106, 264 148",
    chip: [98, 153],
  },
  {
    key: "c",
    label: "1",
    front: "M 46 156 C 54 182, 102 194, 158 194 C 214 194, 260 182, 268 156",
    behind: "M 46 156 C 54 130, 102 118, 158 118 C 214 118, 260 130, 268 156",
    chip: [158, 194],
  },
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
      viewBox="0 0 320 236"
      className="mx-auto block max-h-[208px] w-full"
      role="img"
      aria-label="A giant pumpkin with the three tape measurements drawn over it: a band around the widest point, a wrap from the ground over the top and back down across the vine, and a wrap from the ground over the top from stem to blossom."
    >
      <line
        x1="14" y1="215" x2="306" y2="215"
        stroke="var(--color-sage)" strokeOpacity="0.45"
        strokeWidth="1.5" strokeLinecap="round"
      />
      <ellipse cx="158" cy="214" rx="104" ry="7" fill="var(--color-ink)" opacity="0.13" />

      {/* stem: behind the body so it sits into the shoulder, not on top of it */}
      <g>
        <path
          d="M 143 104 C 142 88, 138 74, 131 62 C 127 55, 133 47, 140 50
             C 148 54, 154 70, 158 86 C 160 94, 161 100, 161 104 Z"
          fill="var(--color-vine)"
        />
        <path
          d="M 147 98 C 145 86, 142 76, 137 66"
          fill="none" stroke="#2F5A3F" strokeWidth="1.7" strokeLinecap="round"
        />
      </g>

      {/* body */}
      <g stroke="var(--color-vine)" strokeOpacity="0.8" strokeWidth="2.4">
        {LOBES.map((l) => (
          <ellipse
            key={l.cx}
            cx={l.cx} cy={l.cy} rx={l.rx} ry={l.ry}
            fill={l.fill}
          />
        ))}
      </g>

      {/* the dish a giant pumpkin carries around its stem */}
      <path
        d="M 128 106 C 138 100, 166 100, 178 108"
        fill="none" stroke="var(--color-vine)" strokeOpacity="0.35"
        strokeWidth="1.8" strokeLinecap="round"
      />

      {TAPES.map((tape) => {
        const state: State =
          active === tape.key ? "active" : filled[tape.key] ? "filled" : "idle";
        const color = tapeColor(state);
        const width = state === "active" ? 4.8 : state === "filled" ? 3.8 : 2.8;

        return (
          <g key={tape.key}>
            {tape.behind && (
              <path
                d={tape.behind}
                fill="none"
                stroke={color}
                strokeOpacity={state === "idle" ? 0.3 : 0.45}
                strokeWidth={width * 0.7}
                strokeDasharray="5 7"
                strokeLinecap="round"
              />
            )}

            {/* Vine keyline under every tape. Cream was invisible once the body
                became properly saturated — gold on orange needs a dark edge. */}
            <path
              d={tape.front}
              fill="none"
              stroke="var(--color-vine)"
              strokeOpacity="0.9"
              strokeWidth={width + 3.5}
              strokeLinecap="round"
            />
            <path
              key={`${tape.key}-${state}`}
              d={tape.front}
              fill="none"
              stroke={color}
              strokeOpacity={state === "idle" ? 0.9 : 1}
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
