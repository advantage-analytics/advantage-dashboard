"use client";

/**
 * StartOverDialog — "Start over with a different player?", opened by the
 * subject bar's "Not Marcus?" on the trim and details steps of a video upload.
 *
 * Step 2 needs no question: nothing there was set up for the player yet, so
 * the bar goes straight back to step 1. From step 3 on, the video check (and
 * on step 4 the score and players) was answered FOR that player — the camera
 * answers are read relative to player 1 (`docs/ui-revamp-guardrails.md` §4) —
 * so changing the player means redoing them, and the dialog says so before
 * anything is cleared. The work itself is the hook's `startOver()`.
 *
 * Copy is author-approved (2026-09-23) — keep it verbatim.
 */

import {
  ConfirmDialog,
  ConfirmProse,
  Em,
} from "@/components/ui/confirm-dialog";

/** The steps that ask before starting over. */
export type StartOverStep = "trim" | "match";

/** The dialog's words, apart from the component so they can be checked. */
export function startOverCopy({
  step,
  subjectName,
  firstName,
}: {
  step: StartOverStep;
  /** The subject's full name — "Marcus Reid". */
  subjectName: string;
  /** "Marcus", for the Keep button. */
  firstName: string | null;
}) {
  return {
    title: "Start over with a different player?",
    description:
      step === "trim"
        ? `The video check was set up for ${subjectName}, so you'll pick the player again and redo it.`
        : `The video check and this score were set up for ${subjectName}, so you'll go through each step again from step 1.`,
    kept: "your video file",
    cleared:
      step === "trim"
        ? "the trim window and both camera answers."
        : "the trim window, both camera answers, this score and the players.",
    confirmLabel: "Start over",
    // The first name even on the viewer's own profile ("Not you?"): the
    // sentence above names them in full, so "Keep Casey" reads as the same
    // person, where "Keep me" would introduce a second way of saying it.
    cancelLabel: `Keep ${firstName ?? subjectName}`,
  };
}

export function StartOverDialog({
  open,
  onOpenChange,
  step,
  subjectName,
  firstName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: StartOverStep;
  subjectName: string;
  firstName: string | null;
  /** `wizard.startOver()` — the dialog closes itself afterwards. */
  onConfirm: () => void;
}) {
  const copy = startOverCopy({ step, subjectName, firstName });
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="danger"
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirmLabel}
      cancelLabel={copy.cancelLabel}
      onConfirm={() => {
        onConfirm();
        onOpenChange(false);
      }}
    >
      <ConfirmProse>
        <p>
          Kept: <Em>{copy.kept}</Em>.
        </p>
        <p>Cleared: {copy.cleared}</p>
      </ConfirmProse>
    </ConfirmDialog>
  );
}
