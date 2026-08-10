"use client";

import { useEffect, useRef, useState } from "react";
import {
  DIAGNOSE_DISCLAIMER,
  LEAVE_IT_ALONE,
  REFERRAL,
  ROLE_LABEL,
  coerceDiagnosis,
  coerceIdentification,
  type Diagnosis,
  type DiagnoseMode,
  type Identification,
  type Role,
} from "@/lib/diagnose/types";

/**
 * The /diagnose upload form and result.
 *
 * Two questions share it: what is wrong with this plant, and what is this bug.
 * They post to the same route with a `mode` field and render different cards,
 * because the answers are different in kind — one ranks causes, the other names
 * an animal and says whether to leave it alone.
 *
 * Nothing here imports the Anthropic SDK or reads an API key — it posts a photo
 * to /api/diagnose and renders what comes back. Keeping the SDK out of this
 * file is what keeps it out of the browser bundle.
 */

/**
 * Long edge the photo is resized to. This is the high-resolution ceiling the
 * diagnosis model accepts, and it is worth paying for here: mite stippling,
 * the texture of a mildew patch, the spacing of an egg cluster and the spines
 * on a lady beetle larva are all fine detail that a smaller image throws away.
 * Anything larger is resized server-side anyway, so it would only cost upload
 * time.
 */
const MAX_EDGE = 2576;
const JPEG_QUALITY = 0.85;
const MAX_NOTE = 400;

type Result =
  | { mode: "damage"; diagnosis: Diagnosis }
  | { mode: "bug"; identification: Identification };

type State =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "sending" }
  | { kind: "done"; result: Result }
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

/**
 * The badge that carries the whole point of the bug mode. Colour does the work
 * before the words are read: pumpkin for something to deal with, gold for
 * something to leave alone.
 */
const ROLE_STYLE: Record<Role, string> = {
  pest: "bg-pumpkin text-cream",
  beneficial: "bg-gold text-ink",
  neutral: "bg-cream-edge text-vine",
  unknown: "bg-cream-edge text-sage",
};

const CARD = "mb-4 rounded-2xl border border-cream-edge bg-cream p-5";
const HEADING =
  "mb-3.5 text-xs font-bold tracking-[0.09em] text-vine uppercase";

/** The copy that differs between the two questions, in one place. */
const COPY = {
  damage: {
    // Both labels have to hold one line on a 320px phone, so they are short.
    tab: "Plant problem",
    prompt: "Photograph the problem",
    noteLabel: "What are you seeing?",
    notePlaceholder: "Started three days ago on the oldest leaves.",
    sending: "Looking at your plant…",
    hint:
      "Get close. One leaf filling the frame beats the whole patch. Turn the " +
      "leaf over if the trouble is underneath — that is where most of it " +
      "lives. Photos are sent for diagnosis and are not stored.",
  },
  bug: {
    tab: "Identify a bug",
    prompt: "Photograph the bug",
    noteLabel: "Where did you find it?",
    notePlaceholder: "Dozens of them under the leaves near the crown.",
    sending: "Working out what it is…",
    hint:
      "Get as close as your phone will focus, with the insect filling the " +
      "frame. From above if you can. One sharp photo beats three blurry " +
      "ones. Photos are sent for identification and are not stored.",
  },
} as const satisfies Record<DiagnoseMode, Record<string, string>>;

export default function DiagnoseForm() {
  const [mode, setMode] = useState<DiagnoseMode>("damage");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);

  const busy = state.kind === "reading" || state.kind === "sending";
  const copy = COPY[mode];

  // Navigating away with a preview on screen used to pin the original photo —
  // 3-8 MB from a phone camera — for the lifetime of the document.
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  function reset() {
    setState({ kind: "idle" });
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreview(null);
    setNote("");
    if (fileRef.current) fileRef.current.value = "";
  }

  /** Switching question clears the answer — the old card belongs to the old
   *  question, and leaving it under a changed heading reads as a reply. */
  function pick(next: DiagnoseMode) {
    if (next === mode || busy) return;
    setMode(next);
    reset();
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

    // Read once, here: the mode could change under an in-flight request, and
    // the answer must be rendered as the question that was actually asked.
    const asked = mode;

    const body = new FormData();
    body.append("photo", photo, "plant.jpg");
    body.append("mode", asked);
    if (note.trim()) body.append("note", note.trim());

    try {
      const response = await fetch("/api/diagnose", { method: "POST", body });
      const data = (await response.json().catch(() => ({}))) as {
        diagnosis?: unknown;
        identification?: unknown;
        error?: string;
      };

      if (response.ok) {
        if (asked === "bug") {
          const identification = coerceIdentification(data.identification);
          if (identification) {
            setState({ kind: "done", result: { mode: "bug", identification } });
            return;
          }
        } else {
          const diagnosis = coerceDiagnosis(data.diagnosis);
          if (diagnosis) {
            setState({ kind: "done", result: { mode: "damage", diagnosis } });
            return;
          }
        }
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
    } finally {
      // A file input fires no change event when the same file is chosen twice.
      // Without this, re-picking the same photo to retry did nothing at all.
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const result = state.kind === "done" ? state.result : null;

  return (
    <>
      <div
        role="group"
        aria-label="What are you asking about?"
        className="mb-4 grid grid-cols-2 gap-1.5 rounded-2xl border border-cream-edge bg-cream p-1.5"
      >
        {(["damage", "bug"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            disabled={busy}
            onClick={() => pick(option)}
            className={`min-h-[46px] cursor-pointer rounded-xl px-3 text-small font-semibold ${
              mode === option
                ? "bg-vine text-cream"
                : "bg-transparent text-sage"
            }`}
          >
            {COPY[option].tab}
          </button>
        ))}
      </div>

      <section className={CARD}>
        <h2 className={HEADING}>{copy.prompt}</h2>

        <label className="mb-1.5 block text-tiny text-sage" htmlFor="note">
          {copy.noteLabel} <span className="text-sage">(optional)</span>
        </label>
        <textarea
          id="note"
          value={note}
          maxLength={MAX_NOTE}
          rows={2}
          disabled={busy}
          onChange={(e) => setNote(e.target.value)}
          placeholder={copy.notePlaceholder}
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
              ? copy.sending
              : result
                ? "Try another photo"
                : "Take or choose a photo"}
        </label>

        <p className="mt-3 text-tiny leading-[1.6] text-sage">{copy.hint}</p>
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
        <section className={CARD}>
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

      {result?.mode === "damage" && (
        <DiagnosisCards diagnosis={result.diagnosis} />
      )}
      {result?.mode === "bug" && (
        <IdentificationCards identification={result.identification} />
      )}
    </>
  );
}

/** A numbered list of things to go and do. Shared by both answers. */
function Checks({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className={CARD}>
      <h2 className={HEADING}>{title}</h2>
      <ul>
        {items.map((item, i) => (
          <li
            key={i}
            className="flex gap-3 border-t border-cream-edge py-3 first:border-t-0 first:pt-0"
          >
            <span className="numerals mt-px flex h-6 w-6 flex-none items-center justify-center rounded-lg bg-cream-dim text-tiny font-bold text-vine">
              {i + 1}
            </span>
            <span className="text-small leading-relaxed text-ink">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CulturalSteps({ steps }: { steps: string[] }) {
  if (steps.length === 0) return null;
  return (
    <section className={CARD}>
      <h2 className={HEADING}>What you can do without spraying</h2>
      <ul>
        {steps.map((step, i) => (
          <li
            key={i}
            className="border-t border-cream-edge py-3 text-small leading-relaxed text-ink first:border-t-0 first:pt-0"
          >
            {step}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The referral. Rendered under every answer in both modes, whatever the model
 * said — this is the one card that is not the model's to decide.
 */
function SprayCard({ needsProfessional }: { needsProfessional: boolean }) {
  return (
    <section className={CARD}>
      <h2 className={HEADING}>Before you spray anything</h2>
      <p className="text-small leading-relaxed text-ink">
        {needsProfessional
          ? "This one may call for a spray decision, and that decision is not made here. "
          : ""}
        {REFERRAL} In California a written recommendation from a licensed PCA is
        required for most agricultural pesticide use, and what is legal depends
        on the crop, the county and the label.
      </p>
      <p className="mt-3 text-tiny leading-[1.6] text-sage">
        {DIAGNOSE_DISCLAIMER}
      </p>
    </section>
  );
}

function DiagnosisCards({ diagnosis }: { diagnosis: Diagnosis }) {
  return (
    <>
      <section className={CARD}>
        <h2 className={HEADING}>
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

      <Checks
        title={diagnosis.insufficient ? "Try this photo instead" : "Go check"}
        items={diagnosis.checks}
      />
      <CulturalSteps steps={diagnosis.culturalSteps} />
      <SprayCard needsProfessional={diagnosis.needsProfessional} />
    </>
  );
}

function IdentificationCards({
  identification,
}: {
  identification: Identification;
}) {
  const lead = identification.candidates[0];

  return (
    <>
      <section className={CARD}>
        <h2 className={HEADING}>
          {identification.insufficient ? "Not enough to go on" : "What this is"}
        </h2>

        {/* The most useful sentence this page can produce, so it goes above the
            name rather than in the detail below it. */}
        {lead?.role === "beneficial" && (
          <p className="mb-3.5 rounded-xl bg-gold px-[18px] py-3 text-small leading-relaxed font-semibold text-ink">
            {LEAVE_IT_ALONE}
          </p>
        )}

        <p className="text-small leading-relaxed text-ink">
          {identification.observed}
        </p>

        {identification.candidates.map((candidate, i) => (
          <div
            key={`${candidate.name}-${i}`}
            className={`mt-3.5 rounded-xl px-[18px] py-3.5 ${
              i === 0 ? "bg-vine text-cream" : "bg-cream-dim text-ink"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-md px-2 py-0.5 text-micro font-bold tracking-wide uppercase ${
                  ROLE_STYLE[candidate.role]
                }`}
              >
                {ROLE_LABEL[candidate.role]}
              </span>
              {candidate.lifeStage && (
                <span
                  className={`text-micro font-semibold ${
                    i === 0 ? "text-cream/70" : "text-sage"
                  }`}
                >
                  {candidate.lifeStage}
                </span>
              )}
              <span
                className={`ml-auto text-micro font-semibold ${
                  i === 0 ? "text-cream/70" : "text-sage"
                }`}
              >
                {CONFIDENCE_LABEL[candidate.confidence]}
              </span>
            </div>

            <strong className="display-face mt-2 block text-lead leading-tight">
              {candidate.name}
            </strong>
            {candidate.scientificName && (
              <span
                className={`block text-micro italic ${
                  i === 0 ? "text-cream/60" : "text-sage"
                }`}
              >
                {candidate.scientificName}
              </span>
            )}

            <p
              className={`mt-1.5 text-tiny leading-[1.6] ${
                i === 0 ? "text-cream/85" : "text-sage"
              }`}
            >
              {candidate.why}
            </p>
            {i === 0 && identification.candidates.length > 1 && (
              <p className="mt-2 text-micro text-cream/60">
                Below: what else it could be, and how to tell.
              </p>
            )}
          </div>
        ))}
      </section>

      {identification.effect && (
        <section className={CARD}>
          <h2 className={HEADING}>What it does in the patch</h2>
          <p className="text-small leading-relaxed text-ink">
            {identification.effect}
          </p>
        </section>
      )}

      {identification.lookalikes.length > 0 && (
        <section className={CARD}>
          <h2 className={HEADING}>Easy to confuse with</h2>
          <ul>
            {identification.lookalikes.map((item, i) => (
              <li
                key={i}
                className="border-t border-cream-edge py-3 text-small leading-relaxed text-ink first:border-t-0 first:pt-0"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Checks
        title={
          identification.insufficient ? "Try this photo instead" : "Go and look"
        }
        items={identification.checks}
      />
      <CulturalSteps steps={identification.culturalSteps} />
      <SprayCard needsProfessional={identification.needsProfessional} />
    </>
  );
}
