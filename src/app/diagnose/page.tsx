import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Diagnose · Giant Pumpkin Weight Calculator",
  description:
    "Work out why a giant pumpkin is running heavy or light to the OTT chart.",
};

export default function DiagnosePage() {
  return (
    <section className="mb-4 rounded-[14px] border border-line bg-card p-5">
      <h2 className="mb-3.5 text-xs font-bold tracking-[0.09em] text-blue uppercase">
        Diagnose
      </h2>
      <p className="text-sm leading-relaxed text-muted">
        Nothing here yet. This is where a fruit&apos;s measurement history gets
        read for the things a single weight cannot tell you — stalled growth,
        a shape drifting off the chart, heavy-to-chart or light-to-chart trends.
      </p>
    </section>
  );
}
