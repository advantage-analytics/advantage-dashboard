/**
 * What the wizard page derives for display from the hook's state — pure, so
 * each rule can be tested without mounting the flow.
 *
 * Nothing here decides whether a match can be written. The hook re-reads the
 * same facts at the write; these only decide what the page says and whether
 * Continue is awake.
 */

import {
  CONTINUE_LABEL,
  STEP_CONFIG,
  STEP_CONFIG_PROCESSING,
  type EventPreset,
  type Step,
} from "./types";
import type { UseUploadMatchWizardReturn } from "./useUploadMatchWizard";

type WhoPlayed = UseUploadMatchWizardReturn["whoPlayed"];
type Eligibility = UseUploadMatchWizardReturn["eligibility"];

/**
 * Whose match this is, for "Drop Marcus's video here" and "Marcus at the
 * start". Null when it is the uploader's own — the copy then says "your" and
 * "You". A first name, because the sentence is spoken, not filed.
 */
export function subjectFirstNameOf({
  whoPlayed,
  preset,
  playerName,
}: {
  /** Only the subject is read, so a caller holding just that can pass it. */
  whoPlayed: Pick<WhoPlayed, "subject">;
  preset: EventPreset | null;
  playerName: string;
}): string | null {
  const name =
    whoPlayed.subject?.kind === "roster"
      ? whoPlayed.subject.name
      : preset
        ? playerName
        : "";
  return name.trim().split(/\s+/)[0] || null;
}

/** The step's title and lede. */
export function stepHeading({
  step,
  isProcessingProvider,
  line,
  subjectFirstName,
}: {
  step: Step;
  isProcessingProvider: boolean;
  /** A preset IS the line it came from. */
  line: EventPreset | null;
  subjectFirstName: string | null;
}): { title: string; description: string } {
  return {
    ...STEP_CONFIG[step],
    ...(isProcessingProvider ? STEP_CONFIG_PROCESSING[step] : undefined),
    // When the slot was the starting point there is nothing to offer, so the
    // title tells the truth of the step: the score is the only thing left to
    // type, and the subline credits the lineup (design 7c).
    ...(line && step === "match"
      ? {
          title: "The score.",
          description: `${subjectFirstName ?? line.playerName}'s${
            line.round ? ` ${line.round}` : ""
          } line${line.eventName ? ` at ${line.eventName}` : ""} — the lineup filled the rest.`,
        }
      : undefined),
  };
}

export function continueLabelFor(step: Step, isCreating: boolean): string {
  return isCreating ? "Saving…" : CONTINUE_LABEL[step];
}

/**
 * Work in progress, per step: `null` when the step is free to continue, `""`
 * when it is waiting silently, a sentence when the footer should say why.
 * Separate from the missing-fields list because these are states to wait out
 * rather than fields to fill, and they read differently.
 */
export function stepBusyLabel(
  wizard: Pick<
    UseUploadMatchWizardReturn,
    | "step"
    | "selectedProvider"
    | "whoPlayed"
    | "uploadedFile"
    | "isProbing"
    | "isUploading"
    | "isCreating"
    | "parsingState"
    | "formData"
    | "minTrimSeconds"
  >,
  trimSelected: number,
): string | null {
  const {
    uploadedFile,
    isProbing,
    isUploading,
    isCreating,
    parsingState,
    formData,
  } = wizard;
  switch (wizard.step) {
    // Step 1 says nothing in the footer: Continue sleeps at 40% until a source
    // and — in a team workspace — a player are chosen, and the fields
    // themselves are the sentence. The hook refuses Continue on the same two
    // conditions.
    case "provider":
      return !wizard.selectedProvider ||
        (wizard.whoPlayed.required && !wizard.whoPlayed.subject)
        ? ""
        : null;
    // Steps 2 and 3 say nothing either: the zone, the row and the two
    // questions carry their own state, and Continue sleeps at 40% until a file
    // passes the check — and, on the trim step, until the window is wide
    // enough and both camera answers are given.
    case "file":
      return !uploadedFile || isProbing || isUploading || parsingState.isParsing
        ? ""
        : null;
    case "trim":
      return !uploadedFile?.file ||
        isProbing ||
        trimSelected < wizard.minTrimSeconds ||
        formData.fixedCamera === undefined ||
        formData.initialTopPlayerIsPlayer1 === undefined
        ? ""
        : null;
    case "match":
      return !uploadedFile
        ? "Pick the file again on step 2"
        : isUploading
          ? "Validating file…"
          : isCreating
            ? "Saving…"
            : null;
  }
}

/**
 * A roster that has not answered yet is not a roster that failed.
 *
 * Both arrive as `roster: null` and both refuse as `roster-unknown`, which is
 * right for the GATE — nobody should continue against an unknown roster. It is
 * wrong for the NOTICE: on every preset flow and every `?player=` link the
 * athlete is known on the first render while the RPC is still in flight, so
 * the banner would say "We couldn't load the roster. Try again." about a
 * request that has not failed, complete with a Retry button, on the coach's
 * normal path. `whoPlayed.loadFailed` is the hook's own answer to which of the
 * two this is.
 */
export function rosterStillLoading(
  eligibility: Eligibility,
  whoPlayed: WhoPlayed,
): boolean {
  return (
    !eligibility.ok &&
    eligibility.reason === "roster-unknown" &&
    !whoPlayed.loadFailed
  );
}

/**
 * Is the eligibility refusal on screen right now — the same "notice decides
 * the gate" rule as the identity question (T7). Shown on the two steps a fresh
 * Source, a preset File and a resumed File entry can all land on before
 * anything else is answered: step 1 (nothing chosen yet) and step 2 (a preset
 * or a resumed draft opens here directly, past step 1's picker).
 *
 * `athlete-required` is excluded: step 1's own roster picker (or the absence of
 * one, in a personal workspace) IS that explanation, and a second banner saying
 * the same thing would be noise, not help.
 *
 * `pending-approval` on step 1 is excluded the same way: the Source row's grey
 * note under Advantage Intelligence already says it, email included. Continue
 * stays off regardless — the gate reads the refusal, not the notice.
 */
export function eligibilityNoticeShown({
  step,
  eligibility,
  whoPlayed,
}: {
  step: Step;
  eligibility: Eligibility;
  whoPlayed: WhoPlayed;
}): boolean {
  return (
    (step === "provider" || step === "file") &&
    !eligibility.ok &&
    eligibility.reason !== "athlete-required" &&
    !(step === "provider" && eligibility.reason === "pending-approval") &&
    !rosterStillLoading(eligibility, whoPlayed)
  );
}
