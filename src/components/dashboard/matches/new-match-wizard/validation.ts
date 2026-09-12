import { normalizedPersonName } from "@/lib/data/person-name";

import type {
  IdentityConfirmationScope,
  Step,
  IdentityMatchSnapshot,
  IdentityMatchStatus,
  MissingMatchRequirements,
  MatchCompletionRequirementInput,
} from "./types";

/**
 * Compare names from an import and the user-visible athlete name.
 *
 * `normalizedPersonName` decides the contract: case and whitespace are signal-
 * noise; everything else is meaning. The helper returns `requiresConfirmation`
 * for every non-exact structural difference, including empty values, initials,
 * nicknames, punctuation differences and different people.
 */
export function evaluateImportedIdentityMatch(
  match: IdentityMatchSnapshot,
): IdentityMatchStatus {
  const expectedKey = normalizedPersonName(match.athleteName);
  const importedKey = normalizedPersonName(match.importedName);

  if (!expectedKey || !importedKey) {
    return {
      ...match,
      normalizedAthleteName: expectedKey,
      normalizedImportedName: importedKey,
      matchesByName: false,
      requiresConfirmation: true,
      reason: "missing-name",
    };
  }

  const exact = expectedKey === importedKey;
  return {
    ...match,
    normalizedAthleteName: expectedKey,
    normalizedImportedName: importedKey,
    matchesByName: exact,
    requiresConfirmation: !exact,
    reason: exact ? "name-match" : "name-mismatch",
  };
}

/**
 * Build the confirmation key that must stay stable for one parse identity pair.
 *
 * The key is explicitly bound to file generation, workspace, both attribution
 * ids and both names so changing any of those invalidates a prior confirmation.
 * The typed identity names are normalized so trivial format edits keep the
 * confirmation when the person is the same.
 */
export function buildImportIdentityConfirmationKey(
  input: IdentityConfirmationScope,
): string {
  const athleteName = normalizedPersonName(input.athleteName);
  const importedName = normalizedPersonName(input.importedName);

  return [
    `workspace:${input.workspaceId}`,
    `athlete:${input.athleteId ?? ""}`,
    `importedAthlete:${input.importedAthleteId ?? ""}`,
    `athleteName:${athleteName}`,
    `imported:${importedName}`,
    `file:${input.fileGenerationId}`,
  ].join("|");
}

/**
 * Compare a parsed name and return whether it needs a user confirmation step.
 */
export function identityNeedsConfirmation(
  athleteName: string | null | undefined,
  importedName: string | null | undefined,
): boolean {
  return evaluateImportedIdentityMatch({
    athleteId: null,
    importedAthleteId: null,
    athleteName: athleteName ?? "",
    importedName: importedName ?? "",
  }).requiresConfirmation;
}

/**
 * Required-answer collector for the match step.
 *
 * The list is pure: this is the same contract both wizard surfaces consume so
 * adding a requirement in one place can never leave the other blind.
 */
export function collectMatchCompletionRequirements(
  input: MatchCompletionRequirementInput,
): MissingMatchRequirements {
  const labels: string[] = [];

  if (!input.opponentName.trim()) labels.push("opponent");
  if (!input.hasAnySetScore) labels.push("score");
  if (!input.date) labels.push("date");

  if (!input.playerHand) labels.push("player hand");
  if (!input.playerBackhand) labels.push("player backhand");
  if (!input.opponentHand) labels.push("opponent hand");
  if (!input.opponentBackhand) labels.push("opponent backhand");

  if (input.isProcessingProvider) {
    if (!input.playerName.trim()) {
      labels.push(input.playerSubjectIsRoster ? "player name" : "your name");
    }
    if (input.adScoring === undefined) labels.push("scoring");
    if (input.fixedCamera === undefined) labels.push("camera");
    if (input.initialTopPlayerIsPlayer1 === undefined) {
      labels.push("player1 side in video");
    }
  }

  const onlyVideoAnswers =
    labels.length > 0 &&
    labels.every((label) =>
      ["camera", "player1 side in video"].includes(label),
    );

  return {
    labels,
    onlyVideoAnswers,
  };
}

/**
 * Whether Continue is unavailable, as one value.
 *
 * Both ways forward read this: `WizardShell` disables the footer button with
 * it, and `useWizardKeys` refuses plain Enter on it. Keeping the composition
 * here — rather than inline in the flow component — is what makes "click and
 * keyboard cannot disagree" a testable statement rather than a reading of two
 * call sites. The handlers in `useUploadMatchWizard` re-check the same facts
 * at the moment of the write; this is the earlier, visible half.
 */
export function wizardContinueBlocked(input: {
  step: Step;
  /** A step-scoped busy label — probing, uploading, parsing, saving. */
  busy: boolean;
  /** The match step's unanswered-requirements gate. */
  missingMatchAnswers: boolean;
  /** `ImportIdentityState.blocked` — an unread, unconfirmed or refused import. */
  importIdentityBlocked: boolean;
}): boolean {
  if (input.busy) return true;
  if (input.step === "match" && input.missingMatchAnswers) return true;
  return input.step === "file" && input.importIdentityBlocked;
}
