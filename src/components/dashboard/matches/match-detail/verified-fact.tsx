"use client";

import { VerifiedMark } from "@/components/dashboard/matches/verified-mark";
import { useState, useTransition } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  VERIFIED_BY_ADVANTAGE,
  VERIFIED_SCOPE,
  verifiedOnLabel,
  type MatchVerification,
} from "@/lib/data/match-verification";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import { reportMatchIssue } from "./report-issue-actions";

/** The text link the popover ends on, and the form's quiet Cancel. */
const TEXT_ACTION =
  "cursor-pointer self-start rounded-[var(--radius-cell)] text-[11px] font-medium text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";

type Stage = "details" | "form" | "sent";

/**
 * The last fact of the report's details line on a match Verified by
 * Advantage (Advantage Review canvas, "Verified or reviewed" › "Details on
 * click"). The status shows here and nowhere else on the report: a button
 * with the product's verified-check, opening a 230px popover that says what
 * was checked (decision D2: points only) and when.
 *
 * "Something still wrong? Tell us" turns the popover into a short form that
 * files a `match_issue` request for /admin Requests (`reportMatchIssue`).
 * A reader with no account here — the public share page, the sample match —
 * gets the status and the details, never the link (`canReport`).
 *
 * No counts line yet: "142 points checked · 7 corrected" comes from the
 * review row Advantage Review writes (step 3a); a label session marked
 * complete stores no such figures.
 */
export function VerifiedFact({
  matchId,
  verification,
  canReport,
}: {
  matchId: string;
  verification: MatchVerification;
  canReport: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("details");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    // Closed and opened again starts from the details; a draft is kept.
    if (!next) {
      setStage((current) => (current === "sent" ? "details" : current));
      setError(null);
    }
  }

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await reportMatchIssue(matchId, note);
      if (result.ok) {
        setNote("");
        setStage("sent");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {/* The frame's badge: a fact that is a button, so a 6px wash with
            its padding pulled back out — it sits on the line's own x. */}
        <button
          type="button"
          className={cn(
            "-mx-1.5 -my-1 inline-flex h-[22px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[6px] px-1.5 text-[11px] leading-[1.4] whitespace-nowrap text-[var(--ink-700)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
            open && "bg-[var(--surface-subtle)]",
          )}
        >
          <VerifiedMark />
          {VERIFIED_BY_ADVANTAGE}
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={VERIFIED_BY_ADVANTAGE}
        className="flex w-[230px] flex-col gap-1.5 rounded-[12px] border-[var(--border-medium)] bg-[var(--surface-card)] px-4 pt-3.5 pb-3 shadow-[var(--shadow-dropdown)]"
      >
        {stage === "form" ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <label
              htmlFor={`match-issue-${matchId}`}
              className="text-[12px] font-medium text-[var(--ink-900)]"
            >
              What&rsquo;s still wrong?
            </label>
            <textarea
              id={`match-issue-${matchId}`}
              rows={4}
              maxLength={2000}
              autoFocus
              value={note}
              disabled={pending}
              onChange={(event) => setNote(event.target.value)}
              placeholder="The point, the game, and what it should say"
              className="w-full resize-none rounded-[var(--radius-button)] border border-[var(--border-field)] bg-[var(--surface-card)] px-2.5 py-2 text-[12px] leading-[1.5] text-[var(--ink-900)] placeholder:text-[var(--ink-400)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:opacity-50"
            />
            {error ? (
              <p role="alert" className="text-[11px] text-[var(--ink-700)]">
                {error}
              </p>
            ) : null}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                className={TEXT_ACTION}
                disabled={pending}
                onClick={() => {
                  setStage("details");
                  setError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={advButton("primary", "sm")}
                disabled={pending || note.trim().length === 0}
              >
                {pending ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--ink-900)]">
              <VerifiedMark />
              {VERIFIED_BY_ADVANTAGE}
            </span>
            <p className="m-0 text-[11px] leading-[1.55] text-[var(--ink-700)]">
              {VERIFIED_SCOPE} {verifiedOnLabel(verification)}.
            </p>
            {stage === "sent" ? (
              <p
                role="status"
                className="mt-0.5 border-t border-[var(--border-hairline)] pt-2 text-[11px] text-[var(--ink-700)]"
              >
                Thanks. We&rsquo;ll take a look.
              </p>
            ) : canReport ? (
              <div className="mt-0.5 border-t border-[var(--border-hairline)] pt-2">
                <button
                  type="button"
                  className={TEXT_ACTION}
                  onClick={() => setStage("form")}
                >
                  Something still wrong? Tell us
                </button>
              </div>
            ) : null}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
