"use client";

/**
 * The teaching element. Three tape paths drawn over a pumpkin, so a first-year
 * grower can see which wrap each measurement means.
 *
 * Focused input  -> its tape draws in and highlights in pumpkin orange
 * Already filled -> persistent gold path
 * Neither        -> quiet sage
 *
 * On the drawing: this is an Atlantic Giant, not a carving pumpkin. Competition
 * fruit grows so fast the ribs stretch into broad soft folds, and it slumps and
 * spreads under its own weight — roughly twice as wide as it is tall, flat
 * where it sits, with a bumpy irregular outline and a stubby cut stem in a
 * dish. The outline is drawn with deliberate lumps rather than a smooth oval;
 * a clean dome reads as a bread roll, and neat symmetrical lobes read as a
 * jack-o-lantern. Skin is a muted buff-orange because show fruit runs pale,
 * which also lets the tapes carry the contrast.
 *
 * Every tape rides on a vine keyline so it reads as lying on the fruit instead
 * of merging into the folds beneath it.
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

/**
 * Lumpy and asymmetric on purpose. Each segment bulges a little differently,
 * so the silhouette has shoulders and dents instead of one smooth arc.
 */
const BODY =
  "M 36 186 C 31 164, 42 138, 62 121 " +
  "C 80 105, 106 95, 134 92 " +
  "C 158 89, 182 91, 204 99 " +
  "C 228 108, 249 121, 264 139 " +
  "C 279 158, 287 178, 280 195 " +
  "C 271 209, 244 217, 206 219 " +
  "C 166 222, 122 221, 88 216 " +
  "C 60 212, 40 202, 36 186 Z";

/** Broad soft folds and slump creases. Irregular spacing, varied weight. */
const FOLDS = [
  { d: "M 156 100 C 126 124, 102 158, 96 200", w: 2.3, o: 0.2 },
  { d: "M 163 99 C 154 138, 150 180, 154 219", w: 1.7, o: 0.15 },
  { d: "M 170 100 C 190 132, 206 170, 212 210", w: 2.5, o: 0.2 },
  { d: "M 176 103 C 212 120, 246 146, 268 180", w: 2, o: 0.17 },
  { d: "M 148 100 C 112 112, 74 130, 48 160", w: 2.1, o: 0.17 },
  { d: "M 58 198 C 108 210, 176 213, 240 202", w: 1.6, o: 0.12 },
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
    front: "M 66 212 C 36 180, 52 108, 140 94 C 226 82, 288 136, 262 210",
    chip: [255, 134],
  },
  {
    key: "ee",
    label: "3",
    front: "M 126 220 C 82 198, 56 130, 138 92",
    behind: "M 138 92 C 214 74, 282 116, 288 162",
    chip: [85, 162],
  },
  {
    key: "c",
    label: "1",
    front: "M 34 180 C 46 202, 104 210, 158 210 C 214 210, 270 198, 283 178",
    behind: "M 34 180 C 46 158, 104 148, 158 148 C 214 148, 270 158, 283 178",
    chip: [158, 210],
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
      <defs>
        <clipPath id="pumpkin-body">
          <path d={BODY} />
        </clipPath>
        {/* Light off the upper left shoulder, shade into the lower right. */}
        <radialGradient id="pumpkin-skin" cx="34%" cy="28%" r="88%">
          <stop offset="0%" stopColor="#F5C079" />
          <stop offset="52%" stopColor="#E7A85E" />
          <stop offset="100%" stopColor="#C57F38" />
        </radialGradient>
      </defs>

      <line
        x1="14" y1="217" x2="306" y2="217"
        stroke="var(--color-sage)" strokeOpacity="0.45"
        strokeWidth="1.5" strokeLinecap="round"
      />
      <ellipse cx="158" cy="216" rx="120" ry="7" fill="var(--color-ink)" opacity="0.14" />

      {/* stubby cut stem, thick at the shoulder */}
      <g>
        <path
          d="M 154 97 C 153 86, 151 78, 148 70 C 146 63, 156 60, 163 63
             C 170 66, 174 78, 176 97 Z"
          fill="var(--color-vine)"
        />
        <path
          d="M 158 94 C 157 84, 156 76, 154 69"
          fill="none" stroke="#2F5A3F" strokeWidth="1.7" strokeLinecap="round"
        />
        <path
          d="M 167 94 C 166 86, 165 80, 163 73"
          fill="none" stroke="#2F5A3F" strokeWidth="1.4" strokeLinecap="round"
        />
      </g>

      <g clipPath="url(#pumpkin-body)">
        <path d={BODY} fill="url(#pumpkin-skin)" />
        {FOLDS.map((f) => (
          <path
            key={f.d}
            d={f.d}
            fill="none"
            stroke="var(--color-vine)"
            strokeOpacity={f.o}
            strokeWidth={f.w}
            strokeLinecap="round"
          />
        ))}
      </g>

      {/* the dish the stem sits in */}
      <path
        d="M 136 103 C 148 94, 180 94, 194 105"
        fill="none" stroke="var(--color-vine)" strokeOpacity="0.3"
        strokeWidth="1.8" strokeLinecap="round"
      />

      <path d={BODY} fill="none" stroke="var(--color-vine)" strokeOpacity="0.85" strokeWidth="2.4" />

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

            <path
              d={tape.front}
              fill="none"
              stroke="var(--color-vine)"
              strokeOpacity="0.9"
              strokeWidth={width + 2.6}
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
