import { NextResponse } from "next/server";
import { adminDeleteEntry } from "@/lib/leaderboard/entries";
import { requireAdminPasscode } from "@/lib/leaderboard/ownership";
import { passcodeMatches } from "@/lib/leaderboard/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Remove any entry. Gated on ADMIN_PASSCODE, supplied per request rather than
 * exchanged for a session — this is used rarely and deliberately.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  let adminPasscode: string;
  try {
    adminPasscode = requireAdminPasscode();
  } catch (error) {
    console.error("[admin/entries/:id]", error);
    return NextResponse.json({ error: "Admin is not configured." }, { status: 503 });
  }

  const supplied =
    request.headers.get("x-admin-passcode") ??
    (await request
      .json()
      .then((b: unknown) =>
        typeof b === "object" && b !== null
          ? String((b as { passcode?: unknown }).passcode ?? "")
          : "",
      )
      .catch(() => ""));

  if (!supplied || !passcodeMatches(supplied, adminPasscode)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  try {
    const removed = await adminDeleteEntry(id);
    return NextResponse.json({ ok: removed }, { status: removed ? 200 : 404 });
  } catch (error) {
    console.error("[admin/entries/:id]", error);
    return NextResponse.json({ error: "Could not remove that entry." }, { status: 502 });
  }
}
