"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { DialogProblem } from "@/components/ui/dialog-problem";
import { advButton } from "@/lib/ui/adv-button";
import {
  approveClaim,
  rejectClaim,
} from "@/lib/services/programs/admin-actions";
import {
  formatPilotEnd,
  getMonthlyCapHours,
} from "@/lib/services/splitstep/config";

/**
 * The decision a Teams row's `ApproveChip` opens: start this program's pilot,
 * or decline the claim that asked for it.
 *
 * A popover rather than a dialog. The question is small and entirely about the
 * row it hangs off — three facts and two buttons — and a modal would dim the
 * table the admin is working down, which is the thing they are comparing
 * against. It is the one call on this page that sends mail to a real coach, so
 * the numbers it states are read from `splitstep/config.ts` rather than typed
 * here: a hard-coded "75 h" would keep saying 75 the day the cap changes.
 *
 * ## Anchoring
 *
 * Radix positions against an anchor element, and the chip that opened this
 * lives inside a `<Link>` row that `TeamsTable` owns — reaching into it to
 * host a `PopoverTrigger` would mean rewriting T11's table. Instead the caller
 * hands over the chip's viewport rect (captured in a click-capture handler)
 * and this renders a zero-interaction `PopoverAnchor` fixed at exactly that
 * box. The popover then sits under the chip it came from, and the table stays
 * unaware it exists.
 *
 * The rect is a viewport rect, so it goes stale on scroll. That is deliberate:
 * Radix's own collision handling keeps the panel on screen, and a popover that
 * chases a row the admin has scrolled past would be worse than one that stays
 * put next to the decision they are making.
 */

export interface ApprovePilotTarget {
  /** `AdminTeamRow.pendingClaim.id` — the row's claim, not its program. */
  claimId: string;
  teamName: string;
  /** Viewport rect of the chip that opened this, for anchoring. */
  anchorRect: { top: number; left: number; width: number; height: number };
}

export function ApprovePilotPopover({
  target,
  onClose,
  onDecided,
}: {
  /** Null while nothing is open. Changing it re-anchors and resets state. */
  target: ApprovePilotTarget | null;
  onClose: () => void;
  /** Ran after a successful approve or decline — the caller refreshes. */
  onDecided: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Which button is in flight, so only that one reads as busy.
  const [acting, setActing] = useState<"approve" | "decline" | null>(null);

  // A new row's chip reuses this component, so the previous row's refusal has
  // to go with it — otherwise the second popover opens already red.
  const claimId = target?.claimId ?? null;
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (seen.current === claimId) return;
    seen.current = claimId;
    setError(null);
    setActing(null);
  }, [claimId]);

  if (!target) return null;

  const decide = (kind: "approve" | "decline") => {
    if (isPending) return;
    setError(null);
    setActing(kind);
    startTransition(async () => {
      const result =
        kind === "approve"
          ? // No reviewer note from this surface: the popover asks one
            // question and the approval email carries no note field anyway.
            await approveClaim(target.claimId)
          : await rejectClaim(target.claimId);
      if (!result.ok) {
        setError(result.error);
        setActing(null);
        return;
      }
      onDecided();
      onClose();
    });
  };

  return (
    <Popover
      open
      onOpenChange={(next) => {
        // An outside click or Escape closes; a decision in flight does not.
        if (!next && !isPending) onClose();
      }}
    >
      <PopoverAnchor asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none fixed"
          style={{
            top: target.anchorRect.top,
            left: target.anchorRect.left,
            width: target.anchorRect.width,
            height: target.anchorRect.height,
          }}
        />
      </PopoverAnchor>

      <PopoverContent
        align="start"
        sideOffset={8}
        collisionPadding={12}
        aria-label={`Start the pilot for ${target.teamName}?`}
        className="flex w-[292px] flex-col gap-3"
      >
        <p className="text-[13px] font-medium text-[var(--ink-900)]">
          Start the pilot for {target.teamName}?
        </p>

        {/* The three facts, in the order they matter: what the program gets,
            what one person gets, when it stops. Values from config, never
            written out here. */}
        <dl className="flex flex-col gap-1.5">
          <Fact
            label="Team pool"
            value={`${getMonthlyCapHours("program")} h every month`}
          />
          <Fact
            label="Each member"
            value={`${getMonthlyCapHours("individual")} h`}
          />
          <Fact label="Ends" value={formatPilotEnd()} />
        </dl>

        <DialogProblem message={error} />

        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`${advButton("ghost", "sm")} flex-1`}
            onClick={() => decide("decline")}
            disabled={isPending}
          >
            {acting === "decline" ? "Declining…" : "Decline"}
          </button>
          <button
            type="button"
            className={`${advButton("primary", "sm")} flex-1`}
            onClick={() => decide("approve")}
            disabled={isPending}
          >
            {acting === "approve" ? "Approving…" : "Approve"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** One fact line — label left at ink-500, value right at ink-900. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12px] text-[var(--ink-500)]">{label}</dt>
      <dd className="text-[12px] text-[var(--ink-900)]">{value}</dd>
    </div>
  );
}
