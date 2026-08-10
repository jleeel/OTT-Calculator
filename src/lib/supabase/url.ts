/**
 * Normalising `NEXT_PUBLIC_SUPABASE_URL`.
 *
 * This exists because of a real outage. Production returned "Supabase read
 * failed: Invalid path specified in request URL" on every board load — the
 * error came back from the host the client was pointed at, not from
 * supabase-js, which means the configured URL was malformed. supabase-js
 * appends `/rest/v1/...` to whatever string it is given and does not sanity
 * check it, so a trailing slash or a pasted dashboard link fails at request
 * time with a message that names neither the variable nor the value.
 *
 * The three ways this gets pasted wrong, all of which are now handled or named:
 *   https://ref.supabase.co/            trailing slash  -> stripped
 *   https://ref.supabase.co/rest/v1     API path        -> stripped
 *   https://supabase.com/dashboard/...  dashboard link  -> rejected by name
 *
 * Pure, so the rules are unit tested rather than discovered in production.
 */

/** What the value should look like once it is right. */
export const SUPABASE_URL_SHAPE = "https://<project-ref>.supabase.co";

/** Paths supabase-js appends itself; harmless to find, wrong to keep. */
const API_PREFIXES = ["/rest/v1", "/auth/v1", "/storage/v1", "/functions/v1"];

export class SupabaseUrlError extends Error {
  constructor(reason: string, value: string) {
    super(
      `NEXT_PUBLIC_SUPABASE_URL ${reason}. It should be ` +
        `${SUPABASE_URL_SHAPE} — the "Project URL" under Project Settings -> ` +
        `Data API in the Supabase dashboard, not the address of the dashboard ` +
        `page itself. Got: ${value}`,
    );
    this.name = "SupabaseUrlError";
  }
}

/**
 * Return the URL supabase-js should be handed, or throw naming the variable.
 *
 * Trailing slashes and an accidental API path are corrected silently — they
 * are unambiguous. A dashboard link is not correctable and is rejected.
 */
export function normalizeSupabaseUrl(raw: string): string {
  const value = raw.trim();

  if (!value) throw new SupabaseUrlError("is empty", "(empty)");

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new SupabaseUrlError("is not a valid URL", value);
  }

  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new SupabaseUrlError(
      `must use https (got ${parsed.protocol.replace(":", "")})`,
      value,
    );
  }

  // The dashboard lives on supabase.com; the API lives on <ref>.supabase.co.
  // Pasting the page you were looking at is the easiest mistake to make here.
  if (parsed.hostname === "supabase.com" || parsed.hostname.endsWith(".supabase.com")) {
    throw new SupabaseUrlError("points at the Supabase dashboard, not the API", value);
  }

  let path = parsed.pathname.replace(/\/+$/, "");
  for (const prefix of API_PREFIXES) {
    if (path === prefix) {
      path = "";
      break;
    }
  }

  if (path) {
    throw new SupabaseUrlError(`has an unexpected path ("${path}")`, value);
  }

  return `${parsed.origin}`;
}
