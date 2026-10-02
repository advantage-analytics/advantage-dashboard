"use client";

import { useState } from "react";
import { Clock } from "lucide-react";

import {
  noteIconCls,
  warningStripCls,
} from "@/components/dashboard/matches/new-match-wizard/styles";
import { expiryNoticeCopy } from "@/lib/match-video/film-entry";

import { keepMatchVideo } from "./record-video-view";

/**
 * "Not watched in 11 months, so this video will be removed on Oct 23. The
 * statistics stay." — the Video view's warning in the last 30 days before an
 * unwatched match video expires (SwingVision Add video T10, canvas frame
 * ExpiryNotice).
 *
 * The warning register because it must not be missed: the file goes on a
 * date whether anyone reads this or not. One row, and the one answer is text
 * rather than a button — the house rule for anything inside the yellow box
 * (`primitives.md` › Warning question; `ImportIdentityNotice`'s strong
 * answer). Size is the one notice size (11px, 13px glyph), not the canvas's
 * 12px: colour carries the meaning, size never does.
 *
 * "Keep this video" sends the same POST a play does (T8's `/video/viewed`),
 * which anyone who can see the match may send — so there is no permission to
 * check here, and none is. The notice hides only once the request has
 * succeeded: hiding on the click would tell the viewer the clock restarted
 * when it may not have. A failure keeps the notice and says so in the answer.
 */
export function FilmExpiryNotice({
  matchId,
  monthsUnwatched,
  expiresAt,
}: {
  matchId: string;
  monthsUnwatched: number;
  /** ISO 8601 — `MatchVideoAttachment.expiresAt`. */
  expiresAt: string;
}) {
  const [status, setStatus] = useState<"idle" | "saving" | "failed" | "kept">(
    "idle",
  );
  if (status === "kept") return null;

  async function keep() {
    setStatus("saving");
    setStatus((await keepMatchVideo(matchId)) ? "kept" : "failed");
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`${warningStripCls} flex-wrap gap-x-3 gap-y-1.5`}
      data-testid="film-expiry-notice"
    >
      <Clock className={noteIconCls} strokeWidth={1.5} aria-hidden="true" />
      <p className="min-w-[14rem] flex-1">
        {expiryNoticeCopy(monthsUnwatched, expiresAt)}
        {status === "failed" && " That didn't go through."}
      </p>
      <button
        type="button"
        onClick={keep}
        disabled={status === "saving"}
        className="cursor-pointer text-[11px] font-medium whitespace-nowrap text-[var(--warning-text)] underline decoration-[var(--warning-border)] underline-offset-[3px] transition-colors duration-150 hover:decoration-[var(--warning-text)] disabled:cursor-default disabled:opacity-70"
        data-testid="film-expiry-keep"
      >
        {status === "failed" ? "Try again" : "Keep this video"}
      </button>
    </div>
  );
}
