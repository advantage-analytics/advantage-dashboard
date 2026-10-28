"use client";

import { VerifiedMark } from "@/components/dashboard/matches/verified-mark";
import { useOptionalWorkspace } from "@/components/dashboard/workspace-provider";
import { useRef, useState, type ReactNode } from "react";
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
  type ReportPoint,
} from "@/lib/data/match-verification";
import { cn } from "@/lib/utils";
import { TellUsDialog } from "./tell-us-dialog";

/** The text link the popover ends on. */
const TEXT_ACTION =
  "cursor-pointer self-start rounded-[var(--radius-cell)] text-[11px] font-medium text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";

/**
 * The last fact of the report's details line on a match Verified by
 * Advantage (Advantage Review canvas, "Verified or reviewed" › "Details on
 * click"). The status shows here and nowhere else on the report: a button
 * with the product's verified-check, opening a 230px popover that says what
 * was checked (decision D2: points only) and when.
 *
 * The popover holds the details only. "Something still wrong? Tell us" closes
 * it and opens `TellUsDialog`, the design system's form dialog, which files a
 * `match_issue` request for /admin Requests. Its draft lives here, so Cancel
 * — which comes back to this popover — and closing both keep it. A reader
 * with no account here — the public share page, the sample match — gets the
 * status and the details, never the link (`canReport`).
 *
 * No counts line yet: "142 points checked · 7 corrected" comes from the
 * review row Advantage Review writes (step 3a); a label session marked
 * complete stores no such figures.
 */
export function VerifiedFact({
  matchId,
  verification,
  canReport,
  trigger,
  lead,
  point = null,
}: {
  matchId: string;
  verification: MatchVerification;
  canReport: boolean;
  /**
   * A different button to open the same popover from — the lock that stands
   * where Fix points would (`self-review/fix-points-actions.tsx`). It must be
   * a single element that accepts a ref (`PopoverTrigger asChild`).
   */
  trigger?: ReactNode;
  /** A first sentence above the details: what the lock keeps fixed. */
  lead?: string;
  /**
   * A point for the report to name, taken when "Tell us" is pressed. No
   * caller passes one yet; self review's Video-tab entry will.
   */
  point?: ReportPoint | null;
}) {
  const email = useOptionalWorkspace()?.viewer.email ?? null;
  const [open, setOpen] = useState(false);
  const [telling, setTelling] = useState(false);
  const [note, setNote] = useState("");
  const [reportPoint, setReportPoint] = useState<ReportPoint | null>(null);
  // The popover's trigger. Closing the dialog hands focus back here: the
  // "Tell us" link that opened it unmounted with the popover.
  const triggerRef = useRef<HTMLButtonElement>(null);

  function tellUs() {
    setReportPoint(point);
    setOpen(false);
    setTelling(true);
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild ref={triggerRef}>
          {trigger ?? (
            /* The frame's badge: a fact that is a button, so a 6px wash with
              its padding pulled back out — it sits on the line's own x. */
            <button
              type="button"
              className={cn(
                "-mx-1.5 -my-1 inline-flex h-[22px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[6px] px-1.5 text-[11px] leading-[1.4] whitespace-nowrap text-[var(--ink-700)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                (open || telling) && "bg-[var(--surface-subtle)]",
              )}
            >
              <VerifiedMark />
              {VERIFIED_BY_ADVANTAGE}
            </button>
          )}
        </PopoverTrigger>
        <PopoverContent
          aria-label={VERIFIED_BY_ADVANTAGE}
          className="flex w-[230px] flex-col gap-1.5 rounded-[12px] border-[var(--border-medium)] bg-[var(--surface-card)] px-4 pt-3.5 pb-3 shadow-[var(--shadow-dropdown)]"
        >
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--ink-900)]">
            <VerifiedMark />
            {VERIFIED_BY_ADVANTAGE}
          </span>
          {lead ? (
            <p className="m-0 text-[11px] leading-[1.55] text-[var(--ink-900)]">
              {lead}
            </p>
          ) : null}
          <p className="m-0 text-[11px] leading-[1.55] text-[var(--ink-700)]">
            {VERIFIED_SCOPE} {verifiedOnLabel(verification)}.
          </p>
          {canReport ? (
            <div className="mt-0.5 border-t border-[var(--border-hairline)] pt-2">
              <button type="button" className={TEXT_ACTION} onClick={tellUs}>
                Something still wrong? Tell us
              </button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
      {canReport ? (
        <TellUsDialog
          open={telling}
          onOpenChange={setTelling}
          onCancel={() => {
            setTelling(false);
            setOpen(true);
          }}
          matchId={matchId}
          email={email}
          point={reportPoint}
          onRemovePoint={() => setReportPoint(null)}
          note={note}
          onNoteChange={setNote}
          onSent={() => setNote("")}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // Cancel reopens the popover, which takes focus itself.
            if (!open) triggerRef.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}
