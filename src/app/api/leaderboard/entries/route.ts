import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { insertEntry } from "@/lib/leaderboard/entries";
import {
  OWNER_MAX_AGE_SECONDS,
  ownerCookieName,
  signOwnership,
} from "@/lib/leaderboard/ownership";
import {
  RATE_LIMIT_MAX,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  recordInsert,
  requirePasscode,
  signSession,
  verifySession,
} from "@/lib/leaderboard/session";
import { validateEntry } from "@/lib/leaderboard/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Server clock, UTC. California is behind UTC, so a same-day local
 *  measurement never reads as "in the future" here. */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Add an entry to the leaderboard.
 *
 * Requires the passcode session cookie. The weight is recomputed from the three
 * measurements server-side; anything the client claims about weight or OTT is
 * discarded by `validateEntry` before it gets here.
 */
export async function POST(request: Request) {
  let secret: string;
  try {
    secret = requirePasscode();
  } catch (error) {
    console.error("[leaderboard/entries]", error);
    return NextResponse.json(
      { error: "The leaderboard is not configured yet. Ask the organiser." },
      { status: 503 },
    );
  }

  const now = Date.now();
  const store = await cookies();
  const session = verifySession(store.get(SESSION_COOKIE)?.value, secret, now);

  if (!session) {
    return NextResponse.json(
      {
        error: "Enter the patch passcode to post to the leaderboard.",
        code: "passcode_required",
      },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Could not read that submission." },
      { status: 400 },
    );
  }

  const validated = validateEntry(body, todayISO());
  if (!validated.ok) {
    return NextResponse.json(
      {
        error:
          validated.errors.length === 1
            ? validated.errors[0].message
            : `That submission has ${validated.errors.length} problems.`,
        fields: validated.errors,
      },
      { status: 400 },
    );
  }

  // Checked before the write, committed to the cookie only after it succeeds,
  // so a failed insert does not burn a slot.
  const limited = recordInsert(session, now);
  if (!limited.ok) {
    const minutes = Math.ceil(limited.retryAfterSeconds / 60);
    return NextResponse.json(
      {
        error:
          `That is ${RATE_LIMIT_MAX} entries in an hour, which is the limit. ` +
          `Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        code: "rate_limited",
      },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
      },
    );
  }

  try {
    const { row: entry, editToken } = await insertEntry(validated.value);

    const response = NextResponse.json(
      { ok: true, entry, editToken },
      { status: 201 },
    );

    // Ownership of this specific entry, so this browser can remove it later.
    response.cookies.set(
      ownerCookieName(entry.id),
      signOwnership(editToken, secret),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: OWNER_MAX_AGE_SECONDS,
      },
    );
    response.cookies.set(SESSION_COOKIE, signSession(limited.session, secret), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    // The real message can name the database; keep it in the server log.
    console.error("[leaderboard/entries]", error);
    return NextResponse.json(
      { error: "Could not save that entry. Try again in a moment." },
      { status: 502 },
    );
  }
}
