import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { checkImage, cleanNote } from "@/lib/diagnose/image";
import {
  DIAGNOSE_MODEL,
  DIAGNOSIS_TOOL,
  IDENTIFY_PROMPT,
  IDENTIFY_TOOL,
  SYSTEM_PROMPT,
} from "@/lib/diagnose/prompt";
import { clientIp, rateLimitMessage } from "@/lib/diagnose/rate-limit";
import {
  claimDiagnoseSlot,
  pruneDiagnoseRequests,
} from "@/lib/diagnose/requests";
import {
  parseDiagnosis,
  parseIdentification,
  parseMode,
} from "@/lib/diagnose/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vision plus a few hundred tokens of output; comfortably inside this. */
export const maxDuration = 60;

/**
 * Diagnose a plant photo, or identify the animal in one.
 *
 * Two questions, one route: the model call, the image handling and the rate
 * limiter are identical, and only the prompt, the tool and the shape of the
 * answer differ. Splitting it into two routes would have duplicated the
 * limiter, which is the part that must not be got wrong twice.
 *
 * The API key is read here and only here. It is not prefixed NEXT_PUBLIC_, this
 * module is a route handler, and the SDK is imported nowhere on the client — so
 * the key cannot reach the browser bundle.
 */

function fail(message: string, status: number, extra: object = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.error("[diagnose] ANTHROPIC_API_KEY is not set");
    return fail("Plant help is not switched on yet. Ask the organiser.", 503);
  }

  // Vercel sets these; locally there is no proxy and the address is unknown.
  // Rather than let an unknown address bypass the limit, they share one bucket.
  const ip = clientIp(request.headers) ?? "unknown";

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Could not read that upload.", 400);
  }

  const mode = parseMode(form.get("mode"));

  const file = form.get("photo");
  if (!(file instanceof File)) {
    return fail(
      mode === "bug" ? "Attach a photo of the bug." : "Attach a photo of the plant.",
      400,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = checkImage(bytes);
  if (!image.ok) return fail(image.message, 400);

  const note = cleanNote(form.get("note"));

  const now = Date.now();
  try {
    const quota = await claimDiagnoseSlot(ip, now);
    if (!quota.ok) {
      return fail(rateLimitMessage(quota.retryAfterSeconds), 429, {
        code: "rate_limited",
      });
    }
  } catch (error) {
    // The limiter is down. Refusing is the safe direction — an open door here
    // is an open door on someone else's API bill.
    console.error("[diagnose] rate limit check failed", error);
    return fail("Plant help is having a moment. Try again shortly.", 503);
  }

  const client = new Anthropic({ apiKey });

  const bug = mode === "bug";
  const opening = bug
    ? "I found this in my pumpkin patch."
    : "Here is my plant.";
  const question = bug
    ? "What is it, and should I be worried about it?"
    : "What is going on with it?";
  const prompt = note
    ? `${opening} What I am seeing: ${note}`
    : `${opening} ${question}`;
  const tool = bug ? IDENTIFY_TOOL : DIAGNOSIS_TOOL;

  try {
    const response = await client.messages.create({
      model: DIAGNOSE_MODEL,
      // Caps thinking *and* the answer together. Adaptive thinking is on by
      // default on this model and working out a plant problem from one photo
      // is exactly the kind of task it spends on, so this is sized well above
      // the few hundred tokens the tool call itself needs — a tight budget
      // shows up as `stop_reason: "max_tokens"` and a missing diagnosis.
      max_tokens: 8000,
      // Explicit rather than relying on the default, so the request keeps
      // meaning the same thing if the default moves again.
      thinking: { type: "adaptive" },
      system: bug ? IDENTIFY_PROMPT : SYSTEM_PROMPT,
      tools: [tool],
      // Forced, so the answer always arrives in the shape the page renders.
      tool_choice: { type: "tool", name: tool.name },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: image.mediaType,
                data: Buffer.from(bytes).toString("base64"),
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    const input = toolUse?.input;

    // Each mode gets its own key, so a client that asked one question can never
    // render the other one's answer — a card of empty fields is worse than a
    // plain error.
    const diagnosis = bug || !input ? null : parseDiagnosis(input);
    const identification = bug && input ? parseIdentification(input) : null;

    if (!diagnosis && !identification) {
      console.error("[diagnose] no usable tool call", mode, response.stop_reason);
      return fail("That photo came back without an answer. Try another one.", 502);
    }

    // Fire and forget; the response does not wait on housekeeping.
    void pruneDiagnoseRequests(now);

    return NextResponse.json(
      bug ? { ok: true, mode, identification } : { ok: true, mode, diagnosis },
    );
  } catch (error) {
    // Most specific first. APIConnectionError extends APIError in this SDK, so
    // the order below matters.
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      console.error("[diagnose] timeout", error);
      return fail("That took too long. Try again in a moment.", 504);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      console.error("[diagnose] connection", error);
      return fail("Could not reach the diagnosis service. Try again shortly.", 502);
    }
    if (error instanceof Anthropic.RateLimitError) {
      console.error("[diagnose] upstream rate limit", error);
      return fail("Plant help is busy right now. Try again in a few minutes.", 429);
    }
    if (error instanceof Anthropic.AuthenticationError) {
      // A bad key is a deploy problem, not something the grower can fix.
      console.error("[diagnose] auth", error);
      return fail("Plant help is not configured correctly. Ask the organiser.", 503);
    }
    if (error instanceof Anthropic.APIError) {
      console.error("[diagnose] api error", error.status, error.message);
      return fail("Plant help could not read that photo. Try another one.", 502);
    }

    console.error("[diagnose] unexpected", error);
    return fail("Something went wrong. Try again in a moment.", 500);
  }
}
