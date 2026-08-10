import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plant help · Giant Pumpkin Calculator",
  description:
    "Work out why a giant pumpkin plant is struggling, and what to check next.",
};

export default function DiagnosePage() {
  return (
    <section className="rounded-2xl bg-cream p-5 shadow-[0_2px_16px_rgba(0,0,0,0.16)]">
      <h1 className="display-face text-title leading-tight font-semibold text-vine">
        Plant help
      </h1>
      <p className="mt-2 text-small leading-relaxed text-sage">
        Not built yet. This is where you will be able to show a photo of a
        struggling plant and get a shortlist of likely causes, plus what to
        check on the plant to tell them apart.
      </p>
      <p className="mt-3 text-small leading-relaxed text-sage">
        It will not recommend a spray or a rate. Those decisions are
        crop-specific and, in California, need a permit and a written
        recommendation from a licensed PCA — so it will point you to your local
        extension office instead.
      </p>
    </section>
  );
}
