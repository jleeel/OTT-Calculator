"use client";

/**
 * The teaching element: the supplied pumpkin photograph, with the three OTT
 * measurement guides drawn over it as an SVG overlay.
 *
 * The photograph is used as-is. It is not traced, recreated, recoloured or
 * cropped — `public/pumpkin.png` is byte-identical to the supplied file, and it
 * is served with a plain <img> rather than next/image so the bytes reaching the
 * browser are the same ones. Everything drawn here is overlay only.
 *
 * The overlay shares the photo's coordinate space (viewBox 0 0 1536 1024), so
 * guide positions are in real image pixels and were measured off the file
 * rather than eyeballed: the fruit spans x 25–1507 and y 92–921, the widest
 * row sits at y 562, the stem attaches around (255, 560) and the blossom scar
 * is around (1400, 625).
 *
 * Sizes are ~4.6x their intended on-screen pixels, which is the scale factor
 * when the image renders at a 375px viewport, and they scale up with it.
 *
 * Colour is identity, not state: 1 green, 2 blue, 3 orange, matching each
 * measurement's chip and input. Focusing an input draws its guide in and brings
 * it to full weight; the others stay readable but quieter.
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

const GUIDES: {
  key: TapeKey;
  label: string;
  /** The half of the wrap facing the camera. */
  front: string;
  /** The half passing behind the fruit, dashed. */
  behind?: string;
  chip: [number, number];
}[] = [
  {
    key: "ss",
    label: "2",
    // Ground, over the top, ground — the full side-to-side span.
    front: "M 150 912 C 40 520, 380 80, 790 74 C 1200 80, 1510 500, 1452 912",
    chip: [790, 74],
  },
  {
    key: "ee",
    label: "3",
    // Stem end, over the crown, blossom end. Lies on the fruit's surface.
    front: "M 250 556 C 430 90, 1090 70, 1398 622",
    chip: [776, 225],
  },
  {
    key: "c",
    label: "1",
    // The band around the widest point, level with the ground.
    front: "M 170 596 C 500 672, 1060 672, 1492 596",
    behind: "M 170 596 C 500 520, 1060 520, 1492 596",
    chip: [793, 653],
  },
];

export default function PumpkinDiagram({ active, filled }: Props) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-ink">
      {/*
        Plain <img> on purpose: next/image re-encodes and resizes, and the
        instruction is to use the supplied PNG as an asset unmodified.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/pumpkin.png"
        alt="A giant pumpkin photographed from the side, stem on the left and blossom end on the right."
        width={1536}
        height={1024}
        className="block w-full"
      />

      <svg
        viewBox="0 0 1536 1024"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        {GUIDES.map((guide) => {
          const isActive = active === guide.key;
          const isFilled = filled[guide.key];
          const color = TAPE_COLOR[guide.key];
          const width = isActive ? 21 : isFilled ? 17 : 13;
          const opacity = isActive ? 1 : isFilled ? 0.95 : 0.72;

          return (
            <g key={guide.key}>
              {guide.behind && (
                <path
                  d={guide.behind}
                  fill="none"
                  stroke={color}
                  strokeOpacity={opacity * 0.55}
                  strokeWidth={width * 0.8}
                  strokeDasharray="26 30"
                  strokeLinecap="round"
                />
              )}

              {/* dark keyline so a guide stays legible over bright skin */}
              <path
                d={guide.front}
                fill="none"
                stroke="#1F3D2B"
                strokeOpacity="0.55"
                strokeWidth={width + 15}
                strokeLinecap="round"
              />
              <path
                key={`${guide.key}-${isActive}`}
                d={guide.front}
                fill="none"
                stroke={color}
                strokeOpacity={opacity}
                strokeWidth={width}
                strokeLinecap="round"
                pathLength={1}
                className={isActive ? "tape-draw" : undefined}
              />

              <circle
                cx={guide.chip[0]}
                cy={guide.chip[1]}
                r="58"
                fill={color}
                stroke="#FBF3E2"
                strokeWidth="11"
                opacity={opacity}
              />
              <text
                x={guide.chip[0]}
                y={guide.chip[1]}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="60"
                fontWeight="700"
                fill="#FBF3E2"
                fontFamily="var(--font-display)"
              >
                {guide.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
