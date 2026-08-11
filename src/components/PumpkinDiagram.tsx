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
 * rather than eyeballed: the fruit spans x 25–1507 and y 91–931, the stem
 * attaches around (255, 560) and the blossom scar is around (1400, 625).
 *
 * The widest row of the silhouette reads as y 562, but that row is the stem
 * sticking out to the left, not the fruit. Measuring the body alone — the
 * blossom-side edge is the clean one, since the stem never touches it — the
 * girth peaks around y 600–680. Guide 1 is drawn at y 642 for that reason, and
 * it matters: the GPC instruction is that circumference is taken at the LARGEST
 * circumference, which "will not always be parallel to the ground... on most
 * large pumpkins the largest circumference is not at the stem/blossom level."
 * Drawing that band level with the stem teaches the mistake, and a band placed
 * too high measures short, so the estimate comes in under.
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
    // Ground, over the crown, ground — but ACROSS the fruit, not along it.
    //
    // This band's plane is perpendicular to the stem-blossom axis, and that
    // axis runs left-right in this photo, so the plane contains the view
    // direction and the band is very nearly edge-on: geometrically it projects
    // to a vertical line through the crown. Drawn as a wide left-to-right arch
    // it read as a second over-the-top measurement parallel to guide 3, which
    // is the one thing it is not.
    //
    // So it is drawn as a narrow ellipse, as if the camera sat a few degrees
    // off dead side-on: the near half comes over the crown and down the face
    // toward the viewer, the far half passes behind and is dashed. Same
    // front/behind treatment guide 1 gets, turned through ninety degrees.
    front: "M 782 98 C 940 372, 934 700, 770 924",
    behind: "M 782 98 C 628 372, 622 700, 770 924",
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
    // The band around the largest girth — deliberately drawn BELOW the stem and
    // blossom, which is where it sits on most large fruit. See the note above.
    front: "M 135 642 C 480 730, 1090 730, 1497 642",
    behind: "M 135 642 C 480 556, 1090 556, 1497 642",
    chip: [800, 706],
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
