import type { Metadata } from "next";
import DiagnoseForm from "@/components/DiagnoseForm";
import { DIAGNOSE_DISCLAIMER } from "@/lib/diagnose/types";

const DESCRIPTION =
  "Photograph a giant pumpkin leaf, vine or fruit and get an idea of what is going on with it.";

export const metadata: Metadata = {
  title: "Plant help · Giant Pumpkin Calculator",
  description: DESCRIPTION,
  openGraph: {
    title: "Plant help · Giant Pumpkin Calculator",
    description: DESCRIPTION,
    url: "/diagnose",
  },
  twitter: {
    card: "summary_large_image",
    title: "Plant help · Giant Pumpkin Calculator",
    description: DESCRIPTION,
  },
};

export default function DiagnosePage() {
  return (
    <>
      <section className="mb-4 rounded-2xl border border-cream-edge bg-cream p-5">
        <h1 className="display-face text-title leading-tight text-vine">
          What is wrong with my plant?
        </h1>
        <p className="mt-2 text-small leading-relaxed text-sage">
          Take a photo of the leaf, vine or fruit that is bothering you. You get
          the most likely cause, what else it could be, and what to go and check
          in the patch.
        </p>
        <p className="mt-3 text-tiny leading-[1.6] text-sage">
          It will not name a product or a rate. That is on purpose — what is
          legal to apply depends on the crop, the county and the label, and in
          California most agricultural pesticide use needs a written
          recommendation from a licensed PCA. {DIAGNOSE_DISCLAIMER}
        </p>
      </section>

      <DiagnoseForm />
    </>
  );
}
