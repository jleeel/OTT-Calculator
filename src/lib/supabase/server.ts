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

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.local.example to .env.local and fill it in.`,
    );
  }
  return value;
}

/**
 * Service role client — **bypasses Row Level Security entirely**.
 *
 * Use it only in route handlers and server actions that have already checked
 * the caller is allowed to do what they are asking: writing verified
 * leaderboard entries, admin cleanup, backfills. Never hand its results
 * straight back to an untrusted caller without filtering.
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
 * Cookie-bound client using the anon key. Respects Row Level Security and
 * sees whatever session the request carries — the right default for reading
 * the leaderboard from a server component.
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
