import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Leaderboard · Giant Pumpkin Weight Calculator",
  description:
    "Season leaderboard of submitted giant pumpkin OTT measurements, ranked by estimated weight.",
};

export default function LeaderboardPage() {
  return (
    <section className="mb-4 rounded-[14px] border border-line bg-card p-5">
      <h2 className="mb-3.5 text-xs font-bold tracking-[0.09em] text-blue uppercase">
        Season leaderboard
      </h2>
      <p className="text-sm leading-relaxed text-muted">
        Nothing here yet. This is where submitted measurements will be ranked by
        estimated weight, pulled from Supabase.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Your measurement log on the calculator page stays in your browser —
        entries only reach the leaderboard when you choose to submit one.
      </p>
    </section>
  );
}
