import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { checkImage, cleanNote } from "@/lib/diagnose/image";
import {
  DIAGNOSE_MODEL,
  DIAGNOSIS_TOOL,
  SYSTEM_PROMPT,
} from "@/lib/diagnose/prompt";
import { clientIp, rateLimitMessage } from "@/lib/diagnose/rate-limit";
import {
  claimDiagnoseSlot,
  pruneDiagnoseRequests,
} from "@/lib/diagnose/requests";
import { parseDiagnosis } from "@/lib/diagnose/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vision plus a few hundred tokens of output; comfortably inside this. */
export const maxDuration = 60;

/**
 * Diagnose a plant photo.
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

  const file = form.get("photo");
  if (!(file instanceof File)) {
    return fail("Attach a photo of the plant.", 400);
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

  const prompt = note
    ? `Here is my plant. What I am seeing: ${note}`
    : "Here is my plant. What is going on with it?";

  try {
    const response = await client.messages.create({
      model: DIAGNOSE_MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      tools: [DIAGNOSIS_TOOL],
      // Forced, so the answer always arrives in the shape the page renders.
      tool_choice: { type: "tool", name: DIAGNOSIS_TOOL.name },
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
    const diagnosis = toolUse ? parseDiagnosis(toolUse.input) : null;

    if (!diagnosis) {
      console.error("[diagnose] no usable tool call", response.stop_reason);
      return fail("That photo came back without an answer. Try another one.", 502);
    }

    // Fire and forget; the response does not wait on housekeeping.
    void pruneDiagnoseRequests(now);

    return NextResponse.json({ ok: true, diagnosis });
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
