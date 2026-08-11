"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Shown only on entries this browser posted — the server decides that by
 * checking for a signed ownership cookie, since the client cannot read it.
 */
export default function RemoveEntry({ id }: { id: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "confirm" | "working" | "error">("idle");

  async function remove() {
    setState("working");
    // A dropped connection rejects the fetch outright — on patchy patch-side
    // cellular that is routine, and without the catch the button stayed on a
    // disabled "Removing…" forever.
    let res: Response;
    try {
      res = await fetch(`/api/leaderboard/entries/${id}`, { method: "DELETE" });
    } catch {
      setState("error");
      return;
    }
    if (res.ok) {
      router.refresh();
      return;
    }
    setState("error");
  }

  if (state === "error") {
    return (
      <span className="text-micro text-[#8f3c05]">
        Could not remove that. Reload and try again.
      </span>
    );
  }

  if (state === "confirm") {
    return (
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={remove}
          className="rounded-full bg-vine px-3 py-1 text-micro font-semibold text-cream"
        >
          Remove it
        </button>
        <button
          type="button"
          onClick={() => setState("idle")}
          className="text-micro font-semibold text-sage underline"
        >
          Keep
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={state === "working"}
      onClick={() => setState("confirm")}
      className="text-micro font-semibold text-sage underline underline-offset-2 hover:text-vine disabled:opacity-50"
    >
      {state === "working" ? "Removing…" : "Remove"}
    </button>
  );
}
