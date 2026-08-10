import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { softDeleteEntry } from "@/lib/leaderboard/entries";
import { ownerCookieName, verifyOwnership } from "@/lib/leaderboard/ownership";
import { requirePasscode } from "@/lib/leaderboard/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Remove an entry you posted. The token comes from the httpOnly cookie set
 * when it was created, or from the body for anyone who saved it elsewhere.
 *
 * Soft delete only — the row stays for audit, it just leaves every view.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  let secret: string;
  try {
    secret = requirePasscode();
  } catch (error) {
    console.error("[entries/:id]", error);
    return NextResponse.json(
      { error: "The leaderboard is not configured yet." },
      { status: 503 },
    );
  }

  const store = await cookies();
  let token = verifyOwnership(store.get(ownerCookieName(id))?.value, secret);

  if (!token) {
    const body = await request.json().catch(() => null);
    const supplied =
      typeof body === "object" && body !== null
        ? (body as { token?: unknown }).token
        : undefined;
    if (typeof supplied === "string" && supplied.length > 0) token = supplied;
  }

  if (!token) {
    return NextResponse.json(
      { error: "This entry was not posted from this browser." },
      { status: 403 },
    );
  }

  try {
    const removed = await softDeleteEntry(id, token);
    if (!removed) {
      // Same answer whether it is gone or not yours — no probing.
      return NextResponse.json(
        { error: "This entry was not posted from this browser." },
        { status: 403 },
      );
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.delete(ownerCookieName(id));
    return response;
  } catch (error) {
    console.error("[entries/:id]", error);
    return NextResponse.json(
      { error: "Could not remove that entry. Try again in a moment." },
      { status: 502 },
    );
  }
}
