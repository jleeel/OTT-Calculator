"use client";

/**
 * The teaching element, built to match the supplied design reference: a scene
 * rather than a floating object — dark soil, leaves either side, a bright
 * orange fruit sitting in the patch — with the three tape wraps drawn over it.
 *
 * Colour is identity, not state. Each measurement keeps its own colour in its
 * chip, its input border and its tape: 1 green, 2 blue, 3 orange. Focusing an
 * input draws its tape in and brings it to full weight; the other two stay
 * present but quieter, so all three can be read at once.
 *
 * The body is drawn round and full with strong vertical ribs, which is what the
 * reference photograph shows — earlier passes flattened it into a bread roll.
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

const TAPE_COLOR: Record<TapeKey, string> = {
  c: "var(--color-tape-1)",
  ss: "var(--color-tape-2)",
  ee: "var(--color-tape-3)",
};

/** Full and round with a softly irregular edge — not a smooth ellipse. */
const BODY =
  "M 72 140 C 71 102, 112 66, 170 65 " +
  "C 229 64, 269 101, 268 140 " +
  "C 267 180, 228 207, 170 207 " +
  "C 112 207, 73 180, 72 140 Z";

/**
 * Vertical ribs. For a quadratic with equal endpoints the curve's midpoint is
 * (endpoint + control) / 2, so the control x is solved backwards from where
 * each rib should actually bulge to.
 */
const RIBS = [
  { d: "M 170 76 Q 170 140 170 200", w: 2.2 },
  { d: "M 179 78 Q 214 140 179 198", w: 2 },
  { d: "M 161 78 Q 126 140 161 198", w: 2 },
  { d: "M 189 86 Q 254 140 189 192", w: 1.7 },
  { d: "M 151 86 Q 86 140 151 192", w: 1.7 },
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
    front: "M 54 214 C 32 146, 86 44, 170 44 C 254 44, 308 146, 286 214",
    chip: [170, 44],
  },
  {
    key: "ee",
    label: "3",
    front: "M 80 178 C 84 116, 124 88, 170 88 C 216 88, 256 116, 260 178",
    chip: [170, 88],
  },
  {
    key: "c",
    label: "1",
    front: "M 72 140 C 78 172, 114 186, 170 186 C 226 186, 262 172, 268 140",
    behind: "M 72 140 C 78 112, 114 100, 170 100 C 226 100, 262 112, 268 140",
    chip: [170, 186],
  },
];

/** One stylised pumpkin leaf. */
function Leaf({
  x,
  y,
  scale,
  flip,
  tone,
}: {
  x: number;
  y: number;
  scale: number;
  flip?: boolean;
  tone: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}>
      <path
        d="M 0 0 C -14 -4, -26 -14, -28 -28 C -14 -34, 2 -30, 10 -20
           C 16 -28, 28 -30, 36 -24 C 34 -10, 20 -1, 4 1 Z"
        fill={tone}
      />
      <path
        d="M 2 0 C -6 -8, -14 -16, -22 -24 M 4 -2 C 10 -10, 18 -18, 28 -22"
        fill="none"
        stroke="#1F3D2B"
        strokeOpacity="0.35"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </g>
  );
}

export default function PumpkinDiagram({ active, filled }: Props) {
  return (
    <svg
      viewBox="0 0 340 240"
      className="block w-full rounded-xl"
      role="img"
      aria-label="A giant pumpkin growing in the patch, with the three tape measurements drawn over it: a band around the widest point, a wrap from the ground over the top and back down across the vine, and a wrap over the top from the stem end to the blossom end."
    >
      <defs>
        <clipPath id="scene">
          <rect x="0" y="0" width="340" height="240" rx="12" />
        </clipPath>
        <clipPath id="pumpkin-body">
          <path d={BODY} />
        </clipPath>
      </defs>

      <g clipPath="url(#scene)">
        <rect x="0" y="0" width="340" height="240" fill="#F6EEDC" />

        {/* soil */}
        <path
          d="M 0 196 C 60 188, 120 192, 170 191 C 226 190, 288 187, 340 194 L 340 240 L 0 240 Z"
          fill="#4A331E"
        />
        <path
          d="M 0 201 C 70 195, 130 199, 190 197 C 250 195, 300 194, 340 200"
          fill="none"
          stroke="#65472A"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* leaves either side, tucked behind the fruit */}
        <Leaf x={54} y={201} scale={1.5} tone="#4C8A61" />
        <Leaf x={22} y={210} scale={1.2} tone="#3A6E4B" />
        <Leaf x={288} y={201} scale={1.5} flip tone="#4C8A61" />
        <Leaf x={320} y={210} scale={1.2} flip tone="#3A6E4B" />

        {/* stem off the upper left shoulder, as in the reference */}
        <path
          d="M 92 108 C 80 98, 68 92, 56 92 C 50 92, 48 100, 54 103
             C 66 108, 78 116, 88 126 Z"
          fill="#8A7A3C"
        />
        <path
          d="M 88 110 C 78 102, 68 98, 60 97"
          fill="none"
          stroke="#6B5D2C"
          strokeWidth="1.6"
          strokeLinecap="round"
        />

        {/* fruit */}
        <path d={BODY} fill="#E58230" />
        <g clipPath="url(#pumpkin-body)">
          <ellipse cx="128" cy="108" rx="62" ry="38" fill="#F2A254" opacity="0.55" />
          <path
            d="M 214 60 C 262 84, 292 130, 292 208 L 300 250 L 150 250 Z"
            fill="#C1651A"
            opacity="0.4"
          />
          {RIBS.map((r) => (
            <path
              key={r.d}
              d={r.d}
              fill="none"
              stroke="#B85C15"
              strokeOpacity="0.5"
              strokeWidth={r.w}
              strokeLinecap="round"
            />
          ))}
        </g>
        <path d={BODY} fill="none" stroke="#A9520F" strokeOpacity="0.75" strokeWidth="2" />

        {/* blossom scar */}
        <ellipse cx="266" cy="146" rx="7" ry="9" fill="#C1651A" opacity="0.5" />

        <ellipse cx="170" cy="204" rx="94" ry="9" fill="#2A1A0C" opacity="0.3" />

        {TAPES.map((tape) => {
          const isActive = active === tape.key;
          const isFilled = filled[tape.key];
          const color = TAPE_COLOR[tape.key];
          const width = isActive ? 4.6 : isFilled ? 3.6 : 2.8;
          const opacity = isActive ? 1 : isFilled ? 0.95 : 0.7;

          return (
            <g key={tape.key}>
              {tape.behind && (
                <path
                  d={tape.behind}
                  fill="none"
                  stroke={color}
                  strokeOpacity={opacity * 0.55}
                  strokeWidth={width * 0.8}
                  strokeDasharray="6 7"
                  strokeLinecap="round"
                />
              )}

              {/* cream casing keeps the tape legible over soil, leaf and fruit */}
              <path
                d={tape.front}
                fill="none"
                stroke="#F6EEDC"
                strokeOpacity="0.85"
                strokeWidth={width + 3.2}
                strokeLinecap="round"
              />
              <path
                key={`${tape.key}-${isActive}`}
                d={tape.front}
                fill="none"
                stroke={color}
                strokeOpacity={opacity}
                strokeWidth={width}
                strokeLinecap="round"
                pathLength={1}
                className={isActive ? "tape-draw" : undefined}
              />

              <circle
                cx={tape.chip[0]}
                cy={tape.chip[1]}
                r="13"
                fill={color}
                stroke="#F6EEDC"
                strokeWidth="2.5"
                opacity={opacity}
              />
              <text
                x={tape.chip[0]}
                y={tape.chip[1]}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="13"
                fontWeight="700"
                fill="#F6EEDC"
                fontFamily="var(--font-display)"
              >
                {tape.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
