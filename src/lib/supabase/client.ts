import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for the browser.
 *
 * Uses the publishable (anon) key, so every query it makes is subject to Row
 * Level Security. Safe to import from client components — nothing secret
 * reaches the bundle.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Copy .env.local.example to .env.local and fill them in.",
    );
  }

  return createBrowserClient(url, key);
}
