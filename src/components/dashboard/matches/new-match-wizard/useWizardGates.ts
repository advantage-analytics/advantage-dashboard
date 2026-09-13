"use client";

import { useMemo } from "react";
import type { UseUploadMatchWizardReturn } from "./useUploadMatchWizard";
import {
  collectMatchCompletionRequirements,
  wizardContinueBlocked,
} from "./validation";
import {
  eligibilityNoticeShown,
  rosterStillLoading,
  stepBusyLabel,
} from "./wizard-view";

/**
 * Everything that decides whether Continue is awake, and which notices are on
 * screen to explain it — computed once, so the footer button, the Enter key and
 * the notices all read the same values.
 */
export function useWizardGates(
  wizard: UseUploadMatchWizardReturn,
  /** The early-end question, on screen and still waiting (`useScoreCheck`). */
  scoreCheckUnanswered: boolean,
) {
  const {
    step,
    formData,
    whoPlayed,
    eligibility,
    importIdentity,
    isProcessingProvider,
  } = wizard;

  const trimSelected =
    (formData.videoEndSeconds ?? 0) - (formData.videoStartSeconds ?? 0);

  // Mirrors what buildSplitStepJobRequest() accepts: at least one set with a
  // game count above zero. Three sets of 0-0 is a well-formed payload that
  // describes a match nobody played, and the vendor would take it.
  const hasAnySetScore =
    formData.playerScores.some((n) => (n ?? 0) > 0) ||
    formData.opponentScores.some((n) => (n ?? 0) > 0);

  /**
   * What is still unanswered — a list, not the first offender.
   *
   * A video job's metadata is not optional the way an imported match's is:
   * every one of these is a REQUIRED field in the vendor's job payload
   * (`docs/ui-revamp-guardrails.md` §3.1), and a job that reaches them
   * incomplete is refused after the video has already uploaded. Blocking here
   * costs a click; blocking there costs an hour of transfer.
   *
   * Counting them out loud is the point: naming one at a time meant filling a
   * field, pressing Continue, and being told about the next one.
   *
   * Only for processing providers. A SwingVision import gets its scores and
   * names from the parsed file, so demanding them by hand would ask twice.
   */
  const missing = useMemo(
    () =>
      // The single contract `validation.ts` describes: this is the "earlier,
      // visible half" (the footer pill, and the Continue gate) and
      // `handleCreateMatch`'s write-time check is the same facts re-read at
      // the moment of the write. Both call this one function so a
      // requirement added here can never leave the write-time check blind,
      // or the reverse — the two used to diverge (hand/backhand were only
      // checked at write time, and the camera-position label didn't match
      // between the two).
      collectMatchCompletionRequirements({
        isProcessingProvider,
        hasAnySetScore,
        playerSubjectIsRoster: whoPlayed.subject?.kind === "roster",
        opponentName: formData.opponentName,
        date: formData.date,
        playerName: formData.playerName,
        playerHand: formData.playerHand,
        playerBackhand: formData.playerBackhand,
        opponentHand: formData.opponentHand,
        opponentBackhand: formData.opponentBackhand,
        adScoring: formData.adScoring,
        fixedCamera: formData.fixedCamera,
        initialTopPlayerIsPlayer1: formData.initialTopPlayerIsPlayer1,
      }),
    [
      isProcessingProvider,
      hasAnySetScore,
      whoPlayed.subject,
      formData.opponentName,
      formData.date,
      formData.playerName,
      formData.playerHand,
      formData.playerBackhand,
      formData.opponentHand,
      formData.opponentBackhand,
      formData.adScoring,
      formData.fixedCamera,
      formData.initialTopPlayerIsPlayer1,
    ],
  );

  const stepBusy = stepBusyLabel(wizard, trimSelected);

  /**
   * Is the identity question on screen right now?
   *
   * The gate disables Continue only while it is. `importIdentity.blocked` is
   * true for other reasons too — no file yet, an export that would not parse —
   * and those are already refused by `handleFileContinue` with a sentence.
   * Disabling the button for them would take the sentence away and leave a dead
   * control with no explanation; disabling it for the notice is the opposite,
   * because the notice IS the explanation and the two answers sit in it.
   */
  const identityNoticeVisible =
    step === "file" &&
    !isProcessingProvider &&
    importIdentity.comparison?.requiresConfirmation === true;

  const eligibilityNoticeVisible = eligibilityNoticeShown({
    step,
    eligibility,
    whoPlayed,
  });

  // One value, two ways forward: the footer button is disabled by it and
  // `useWizardKeys` refuses plain Enter on it, so a keyboard user can never
  // pass a gate a clicking user cannot. `wizardContinueBlocked` is pure and
  // lives in `validation.ts` so that claim is tested, not asserted. Whatever
  // slips past it meets the same facts again in the handler.
  const continueDisabled = wizardContinueBlocked({
    step,
    busy: stepBusy !== null,
    // The early-end question, once on screen, is one more unanswered field.
    missingMatchAnswers: missing.labels.length > 0 || scoreCheckUnanswered,
    importIdentityBlocked: identityNoticeVisible && importIdentity.blocked,
    // `|| rosterStillLoading` is the one deliberate exception to T7's
    // "the visible notice decides the gate": there is nothing to explain
    // during a read that is simply still running, but there is also nothing
    // to continue to.
    eligibilityBlocked:
      eligibilityNoticeVisible ||
      rosterStillLoading(eligibility, whoPlayed) ||
      (!eligibility.ok && eligibility.reason === "pending-approval"),
  });

  return {
    trimSelected,
    missing,
    stepBusy,
    gatedByMissing: step === "match" && missing.labels.length > 0,
    identityNoticeVisible,
    eligibilityNoticeVisible,
    continueDisabled,
  };
}

export type WizardGates = ReturnType<typeof useWizardGates>;
