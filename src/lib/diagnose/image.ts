/**
 * Upload rules for the /diagnose photo. Pure, so the limits are unit tested
 * rather than discovered in production by a grower on a phone.
 *
 * The client downscales before it uploads, so in practice nothing here should
 * ever fire. It fires when someone posts to the route directly, which is the
 * case that matters — every accepted upload becomes a paid API call.
 */

export const ALLOWED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

/**
 * Raw bytes, before base64. The Anthropic API caps an image at 5 MB, and
 * base64 inflates by 4/3 — 3.5 MB of pixels encodes to about 4.7 MB, which
 * leaves room for the rest of the request.
 */
export const MAX_IMAGE_BYTES = 3_500_000;

/** Below this it is a stray byte or a failed upload, not a photograph. */
export const MIN_IMAGE_BYTES = 1024;

export type ImageCheck =
  | { ok: true; mediaType: AllowedMediaType }
  | { ok: false; message: string };

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

/**
 * Media type from the file's own bytes, ignoring whatever the client claimed.
 * A declared Content-Type is a hint from the sender; the API bills us either
 * way, so the file has to say what it is.
 */
export function sniffMediaType(bytes: Uint8Array): AllowedMediaType | null {
  // JPEG: FF D8 FF
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }

  return null;
}

export function checkImage(bytes: Uint8Array): ImageCheck {
  if (bytes.length < MIN_IMAGE_BYTES) {
    return { ok: false, message: "That file is empty or did not upload fully." };
  }

  if (bytes.length > MAX_IMAGE_BYTES) {
    const mb = (MAX_IMAGE_BYTES / 1_000_000).toFixed(1);
    return {
      ok: false,
      message: `That photo is over ${mb} MB. Take it again at a smaller size, or crop in on the problem.`,
    };
  }

  const mediaType = sniffMediaType(bytes);
  if (!mediaType) {
    return {
      ok: false,
      message: "That is not a JPEG, PNG or WebP photo.",
    };
  }

  return { ok: true, mediaType };
}

/** Free-text note from the grower. Long enough to be useful, short enough to bound. */
export const MAX_NOTE_LENGTH = 400;

/**
 * The note goes into the prompt, so control characters come out and length is
 * capped. It is not sanitised beyond that — it is never rendered as HTML, and
 * the system prompt's hard rule holds regardless of what the note asks for.
 */
export function cleanNote(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, MAX_NOTE_LENGTH);
}
