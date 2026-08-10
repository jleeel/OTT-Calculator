import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  newSession,
  passcodeMatches,
  requirePasscode,
  signSession,
  verifySession,
} from "@/lib/leaderboard/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/**
 * Whether this browser already holds a valid session, so the submit dialog
 * knows whether to ask for the passcode. Reveals nothing about the passcode.
 */
export async function GET() {
  try {
    const secret = requirePasscode();
    const store = await cookies();
    const session = verifySession(
      store.get(SESSION_COOKIE)?.value,
      secret,
      Date.now(),
    );
    return NextResponse.json({ authenticated: session !== null });
  } catch {
    // A missing passcode is a server misconfiguration, not a client error.
    // Report "not authenticated" and let the POST surface the real reason.
    return NextResponse.json({ authenticated: false });
  }
}

/** Exchange the patch passcode for a signed, httpOnly session cookie. */
export async function POST(request: Request) {
  let secret: string;
  try {
    secret = requirePasscode();
  } catch (error) {
    console.error("[leaderboard/auth]", error);
    return NextResponse.json(
      { error: "The leaderboard is not configured yet. Ask the organiser." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Could not read that request." },
      { status: 400 },
    );
  }

  const submitted =
    typeof body === "object" && body !== null
      ? (body as { passcode?: unknown }).passcode
      : undefined;

  if (typeof submitted !== "string" || submitted.trim().length === 0) {
    return NextResponse.json({ error: "Enter the passcode." }, { status: 400 });
  }

  if (!passcodeMatches(submitted.trim(), secret)) {
    return NextResponse.json(
      { error: "That passcode is not right. Check with whoever runs the patch." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    SESSION_COOKIE,
    signSession(newSession(Date.now()), secret),
    sessionCookieOptions(),
  );
  return response;
}
