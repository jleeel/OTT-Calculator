"use client";

import { useRef, useState } from "react";
import {
  DIAGNOSE_DISCLAIMER,
  REFERRAL,
  coerceDiagnosis,
  type Diagnosis,
} from "@/lib/diagnose/types";

/**
 * The /diagnose upload form and result.
 *
 * Nothing here imports the Anthropic SDK or reads an API key — it posts a photo
 * to /api/diagnose and renders what comes back. Keeping the SDK out of this
 * file is what keeps it out of the browser bundle.
 */

/**
 * Long edge the photo is resized to. This is the high-resolution ceiling the
 * diagnosis model accepts, and it is worth paying for here: mite stippling,
 * the texture of a mildew patch and the difference between chewing damage and
 * a lesion are all fine detail that a smaller image throws away. Anything
 * larger is resized server-side anyway, so it would only cost upload time.
 */
const MAX_EDGE = 2576;
const JPEG_QUALITY = 0.85;
const MAX_NOTE = 400;

type State =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "sending" }
  | { kind: "done"; diagnosis: Diagnosis }
  | { kind: "error"; message: string };

/**
 * Downscale in the browser before uploading. A phone photo is 3–8 MB and most
 * of this traffic is on cellular from a patch; re-encoding at MAX_EDGE keeps
 * the detail the model works from while dropping the sensor noise and metadata
 * around it. The server caps size too — this is for the grower's data plan,
 * not for security.
 */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2d context");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("encode failed");
  return blob;
}

const CONFIDENCE_LABEL = {
  high: "Fairly confident",
  medium: "Reasonably likely",
  low: "A guess from this photo",
} as const;

export default function DiagnoseForm() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);

  const busy = state.kind === "reading" || state.kind === "sending";

  function reset() {
    setState({ kind: "idle" });
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreview(null);
    setNote("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = URL.createObjectURL(file);
    setPreview(previewUrl.current);
    setState({ kind: "reading" });

    let photo: Blob;
    try {
      photo = await shrink(file);
    } catch {
      // Canvas refused — an unusual format, or a browser without the API.
      // Send the original and let the server's size cap decide.
      photo = file;
    }

    setState({ kind: "sending" });

    const body = new FormData();
    body.append("photo", photo, "plant.jpg");
    if (note.trim()) body.append("note", note.trim());

    try {
      const response = await fetch("/api/diagnose", { method: "POST", body });
      const data = (await response.json().catch(() => ({}))) as {
        diagnosis?: unknown;
        error?: string;
      };

      const diagnosis = response.ok ? coerceDiagnosis(data.diagnosis) : null;
      if (diagnosis) {
        setState({ kind: "done", diagnosis });
        return;
      }

      setState({
        kind: "error",
        message:
          data.error ??
          (response.ok
            ? "That came back in a shape this page could not read. Try again."
            : "That did not go through. Try again."),
      });
    } catch {
      setState({
        kind: "error",
        message:
          "Could not reach the server. Check your connection and try again.",
      });
    }
  }

  const diagnosis = state.kind === "done" ? state.diagnosis : null;

  return (
    <>
      <section className="mb-4 rounded-2xl border border-cream-edge bg-cream p-5">
        <h2 className="mb-3.5 text-xs font-bold tracking-[0.09em] text-vine uppercase">
          Photograph the problem
        </h2>

        <label className="mb-1.5 block text-tiny text-sage" htmlFor="note">
          What are you seeing? <span className="text-sage">(optional)</span>
        </label>
        <textarea
          id="note"
          value={note}
          maxLength={MAX_NOTE}
          rows={2}
          disabled={busy}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Started three days ago on the oldest leaves."
          className="mb-3.5 w-full resize-y rounded-xl border border-cream-edge bg-white px-3.5 py-3 text-base text-ink"
        />

        <input
          ref={fileRef}
          id="photo"
          type="file"
          accept="image/*"
          // No `capture` attribute on purpose: it forces the camera on iOS and
          // Android and drops the photo library, and half of these photos were
          // taken an hour ago in the patch.
          disabled={busy}
          onChange={onPick}
          className="sr-only"
        />
        <label
          htmlFor="photo"
          className={`flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-xl p-3.5 text-small font-bold ${
            busy ? "bg-cream-edge text-sage" : "bg-gold text-ink"
          }`}
        >
          {state.kind === "reading"
            ? "Reading the photo…"
            : state.kind === "sending"
              ? "Looking at your plant…"
              : diagnosis
                ? "Try another photo"
                : "Take or choose a photo"}
        </label>

        <p className="mt-3 text-tiny leading-[1.6] text-sage">
          Get close. One leaf filling the frame beats the whole patch. Turn the
          leaf over if the trouble is underneath — that is where most of it
          lives. Photos are sent for diagnosis and are not stored.
        </p>
      </section>

      {preview && (
        <section className="mb-4 overflow-hidden rounded-2xl border border-cream-edge bg-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="The photo you uploaded"
            className="block max-h-[300px] w-full object-contain"
          />
        </section>
      )}

      {state.kind === "error" && (
        <section className="mb-4 rounded-2xl border border-cream-edge bg-cream p-5">
          <p className="text-small leading-relaxed text-ink">{state.message}</p>
          <button
            type="button"
            onClick={reset}
            className="mt-3 cursor-pointer rounded-xl border border-cream-edge bg-white px-4 text-small font-semibold text-vine"
          >
            Start over
          </button>
        </section>
      )}

      {diagnosis && (
        <>
          <section className="mb-4 rounded-2xl border border-cream-edge bg-cream p-5">
            <h2 className="mb-3.5 text-xs font-bold tracking-[0.09em] text-vine uppercase">
              {diagnosis.insufficient ? "Not enough to go on" : "What this looks like"}
            </h2>

            <p className="text-small leading-relaxed text-ink">
              {diagnosis.observed}
            </p>

            {diagnosis.causes.map((cause, i) => (
              <div
                key={`${cause.name}-${i}`}
                className={`mt-3.5 rounded-xl px-[18px] py-3.5 ${
                  i === 0 ? "bg-vine text-cream" : "bg-cream-dim text-ink"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <strong className="display-face text-lead leading-tight">
                    {cause.name}
                  </strong>
                  <span
                    className={`flex-none text-micro font-semibold ${
                      i === 0 ? "text-cream/70" : "text-sage"
                    }`}
                  >
                    {CONFIDENCE_LABEL[cause.confidence]}
                  </span>
                </div>
                <p
                  className={`mt-1.5 text-tiny leading-[1.6] ${
                    i === 0 ? "text-cream/85" : "text-sage"
                  }`}
                >
                  {cause.why}
                </p>
                {i === 0 && diagnosis.causes.length > 1 && (
                  <p className="mt-2 text-micro text-cream/60">
                    Below: what else it could be, and how to tell.
                  </p>
                )}
              </div>
            ))}
          </section>

          {diagnosis.checks.length > 0 && (
            <section className="mb-4 rounded-2xl border border-cream-edge bg-cream p-5">
              <h2 className="mb-3.5 text-xs font-bold tracking-[0.09em] text-vine uppercase">
                {diagnosis.insufficient ? "Try this photo instead" : "Go check"}
              </h2>
              <ul>
                {diagnosis.checks.map((check, i) => (
                  <li
                    key={i}
                    className="flex gap-3 border-t border-cream-edge py-3 first:border-t-0 first:pt-0"
                  >
                    <span className="numerals mt-px flex h-6 w-6 flex-none items-center justify-center rounded-lg bg-cream-dim text-tiny font-bold text-vine">
                      {i + 1}
                    </span>
                    <span className="text-small leading-relaxed text-ink">
                      {check}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {diagnosis.culturalSteps.length > 0 && (
            <section className="mb-4 rounded-2xl border border-cream-edge bg-cream p-5">
              <h2 className="mb-3.5 text-xs font-bold tracking-[0.09em] text-vine uppercase">
                What you can do without spraying
              </h2>
              <ul>
                {diagnosis.culturalSteps.map((step, i) => (
                  <li
                    key={i}
                    className="border-t border-cream-edge py-3 text-small leading-relaxed text-ink first:border-t-0 first:pt-0"
                  >
                    {step}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mb-4 rounded-2xl border border-cream-edge bg-cream p-5">
            <h2 className="mb-3.5 text-xs font-bold tracking-[0.09em] text-vine uppercase">
              Before you spray anything
            </h2>
            <p className="text-small leading-relaxed text-ink">
              {diagnosis.needsProfessional
                ? "This one may call for a spray decision, and that decision is not made here. "
                : ""}
              {REFERRAL} In California a written recommendation from a licensed
              PCA is required for most agricultural pesticide use, and what is
              legal depends on the crop, the county and the label.
            </p>
            <p className="mt-3 text-tiny leading-[1.6] text-sage">
              {DIAGNOSE_DISCLAIMER}
            </p>
          </section>
        </>
      )}
    </>
  );
}
