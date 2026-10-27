"use client";

import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, PencilLine } from "lucide-react";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { VerifiedFact } from "@/components/dashboard/matches/match-detail/verified-fact";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import { useSelfReview } from "./self-review-provider";

/** The swap of the action slot: 120ms, the reorder mode's (tables.md). */
const SWAP = { duration: 0.12, ease: [0.16, 1, 0.3, 1] as const };

/**
 * The title row's action for self review, on the Video view only (Advantage
 * Review canvas, "Self review"). Built like the design system's reorder
 * mode: "Fix points" enters the mode, and in it the slot swaps to Cancel and
 * "Save N fixes" (`AnimatePresence mode="popLayout"`, so the primary never
 * moves). Save is live only when saving would change something.
 *
 * On a match Verified by Advantage the slot holds the lock instead (D1): the
 * same popover as the details line's Verified fact, led by what is locked,
 * ending on "Something still wrong? Tell us".
 *
 * Nothing at all for a read-only report, for a viewer who may only look
 * (staff, team players), or with no video and no points to fix.
 */
export function FixPointsActions() {
  const { state, meta } = useMatchReport();
  const { match, points } = useMatchData();
  const review = useSelfReview();

  if (meta.readOnly || state.view !== "film") return null;
  if (!meta.hasPlayableVideo || points.length === 0) return null;

  if (review.locked && match.verification) {
    return (
      <VerifiedFact
        matchId={match.id}
        verification={match.verification}
        canReport
        lead="Its points, score and players are locked."
        trigger={<LockButton />}
      />
    );
  }
  if (!review.state.canFix) return null;

  const count = review.pendingCount;
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {review.fixing ? (
        <motion.div
          key="fixing"
          className="flex items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={SWAP}
        >
          <button
            type="button"
            className={advButton("ghost", "sm")}
            onClick={review.cancel}
            disabled={review.saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className={advButton("primary", "sm")}
            onClick={review.save}
            disabled={count === 0 || review.saving}
          >
            {review.saving
              ? "Saving…"
              : count === 0
                ? "Save"
                : `Save ${count === 1 ? "1 fix" : `${count} fixes`}`}
          </button>
        </motion.div>
      ) : (
        <motion.div
          key="viewing"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={SWAP}
        >
          <button
            type="button"
            className={advButton("outline", "sm")}
            onClick={review.start}
          >
            <PencilLine
              className="size-[13px]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            Fix points
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Where Fix points would be: the lock, opening the Verified popover. */
const LockButton = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button">
>(function LockButton({ className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className={cn(advButton("outline", "sm"), className)}
    >
      <Lock className="size-[13px]" strokeWidth={1.5} aria-hidden="true" />
      Points locked
    </button>
  );
});
