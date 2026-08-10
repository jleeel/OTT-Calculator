import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Supabase clients for the server.
 *
 * The `server-only` import above is load-bearing: it turns an accidental
 * import from a client component into a build error instead of leaking the
 * service role key into the browser bundle.
 */

/** Without these two, nothing on the server side of this app can work. */
const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

function missingEnv(names: readonly string[]): string[] {
  return names.filter((name) => !process.env[name]?.trim());
}

function envError(missing: string[]): Error {
  const plural = missing.length > 1;
  return new Error(
    `Supabase server client is missing required environment ` +
      `${plural ? "variables" : "variable"}: ${missing.join(", ")}.\n` +
      `Copy .env.local.example to .env.local and fill ${plural ? "them" : "it"} in ` +
      `(local), or set ${plural ? "them" : "it"} under Project Settings -> ` +
      `Environment Variables (Vercel). Values come from the Supabase dashboard: ` +
      `Project Settings -> Data API for the URL, Project Settings -> API Keys for ` +
      `the secret key.`,
  );
}

/**
 * Startup guard. Fails loudly at import time rather than at the first request,
 * so a misconfigured deploy breaks immediately and names what is missing.
 *
 * Skipped during `next build`: the build imports route modules to collect
 * metadata without ever serving a request, and Vercel injects runtime env
 * separately from build env. A build should not require production secrets.
 */
if (process.env.NEXT_PHASE !== "phase-production-build") {
  const missing = missingEnv(REQUIRED_ENV);
  if (missing.length > 0) throw envError(missing);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw envError([name]);
  return value;
}

/**
 * Service role client — **bypasses Row Level Security entirely**.
 *
 * Use it only in route handlers and server actions that have already checked
 * the caller is allowed to do what they are asking. In this app that means
 * exactly one place: the passcode-gated leaderboard insert.
 */
export function createServiceRoleClient() {
  return createSupabaseClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      // No user session to keep: this client authenticates as the service role
      // on every request, so session persistence and refresh are dead weight.
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/**
 * Cookie-bound client using the publishable key. Respects Row Level Security
 * and sees whatever session the request carries — the right default for
 * reading the leaderboard from a server component.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a server component, where cookies are read-only.
            // Harmless as long as middleware refreshes the session.
          }
        },
      },
    },
  );
}
