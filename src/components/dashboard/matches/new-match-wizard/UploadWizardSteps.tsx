"use client";

import { useCallback, useMemo } from "react";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { AnimatedHeight } from "./AnimatedHeight";
import { DetailsStepContent } from "./DetailsStepContent";
import { EligibilityNotice } from "./EligibilityNotice";
import { FileStepContent } from "./FileStepContent";
import { ImportIdentityNotice } from "./ImportIdentityNotice";
import { SourceStepContent } from "./SourceStepContent";
import { TrimStepContent } from "./TrimStepContent";
import { useUploadWizard } from "./UploadWizardProvider";
import { WizardNotice } from "./WizardNotice";

/**
 * The wizard's four step bodies and the notices that sit beside them. Each is
 * an explicit variant: it names the pieces it renders and reads the wizard
 * context for its state, so `UploadMatchWizard` can say which step is on
 * screen without a wall of conditionals.
 */

/**
 * One sentence the flow has to say before the step matters — a draft that was
 * not resumed, a draft that was not saved.
 *
 * The same warning chrome `EligibilityNotice` wears, and for the same reason:
 * both are "this did not happen, and here is why", not "something broke".
 * It renders words it is given and decides nothing; the rule that produced
 * the sentence lives with the rule, never here.
 */
function FlowNotice({ children }: { children: React.ReactNode }) {
  return (
    <WizardNotice>
      <p>{children}</p>
    </WizardNotice>
  );
}

/**
 * Said before the step, because both answer a question the person already
 * asked: "did my draft come back" and "did my draft save". The refusal only
 * belongs on the entry step — once they have moved on, the flow they are in is
 * the answer.
 */
export function DraftNotices() {
  const {
    wizard: { step, firstStep, draftSaveError },
    meta: { draftRefusal },
  } = useUploadWizard();
  const refused = draftRefusal && step === firstStep;
  if (!refused && !draftSaveError) return null;
  return (
    <div className="mb-9 flex flex-col gap-3">
      {refused && <FlowNotice>{draftRefusal}</FlowNotice>}
      {draftSaveError && <FlowNotice>{draftSaveError}</FlowNotice>}
    </div>
  );
}

/** The eligibility refusal, when `view.eligibilityNoticeVisible` says so. */
function WizardEligibilityNotice() {
  const {
    wizard: { eligibility, retryEligibility },
    view: { eligibilityNoticeVisible },
  } = useUploadWizard();
  if (!eligibilityNoticeVisible || eligibility.ok) return null;
  return (
    <EligibilityNotice eligibility={eligibility} onRetry={retryEligibility} />
  );
}

/**
 * Step 1 — Workspace · For · Source. In a personal workspace For is the
 * uploader; in a team workspace it is the one thing the workspace cannot infer
 * — whose match this is — and the hook refuses Continue until it is answered.
 *
 * A preset never reaches this step: a line arrives with all three answered and
 * opens on the file step (`firstStep`). That is the bar a preset has to clear —
 * it may replace step 1 only by answering every question on it, never by
 * defaulting one.
 */
export function ProviderStep() {
  const {
    wizard: {
      selectedProvider,
      handleProviderSelect,
      whoPlayed,
      providerQuotaRefusal,
    },
  } = useUploadWizard();
  return (
    <div className="flex flex-col gap-9">
      <SourceStepContent
        selectedProvider={selectedProvider}
        onProviderSelect={handleProviderSelect}
        whoPlayed={whoPlayed}
        /* Null for an import source and while the allowance is still
           loading — the hook decides both, so this step never has to. */
        quotaRefusal={providerQuotaRefusal}
      />
      <WizardEligibilityNotice />
    </div>
  );
}

/**
 * Step 2 asks for one thing. The same content for both kinds; the handlers
 * differ because a video is probed locally and an export is validated and
 * read.
 *
 * The identity notice is a SIBLING of the step content, in the step's own 36px
 * rhythm — it sits after "Found in the export", where the two names it is
 * asking about have just been shown, and above nothing, so it can never cover
 * the drop zone's error strip or the parse progress. The column exists because
 * `WizardShell`'s content slot is a plain div with no gap of its own.
 */
export function FileStep() {
  const { wizard, view } = useUploadWizard();
  const {
    isProcessingProvider,
    selectedProvider,
    uploadedFile,
    videoProbe,
    videoWarnings,
    isProbing,
    isUploading,
    parsingState,
    uploadError,
    formData,
    acceptString,
    isOver,
    setIsOver,
    onVideoPick,
    handleDrop,
    handleFileChange,
    handleRemoveFile,
    handleRemoveVideo,
  } = wizard;

  const onDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsOver(true);
    },
    [setIsOver],
  );
  const onDragLeave = useCallback(() => setIsOver(false), [setIsOver]);

  // Stable so memo(FileStepContent) can actually skip renders — an inline
  // arrow here made its shallow compare fail on every parent render.
  const onVideoDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsOver(false);
      onVideoPick(e.dataTransfer.files?.[0] ?? null);
    },
    [setIsOver, onVideoPick],
  );
  const onVideoFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onVideoPick(e.target.files?.[0] ?? null);
      // So picking the same file again after Remove still fires a change.
      e.target.value = "";
    },
    [onVideoPick],
  );

  return (
    <div className="flex flex-col gap-9">
      <FileStepContent
        kind={isProcessingProvider ? "processing" : "import"}
        selectedProvider={selectedProvider}
        subjectFirstName={view.subjectFirstName}
        uploadedFile={uploadedFile}
        probe={videoProbe}
        warnings={isProcessingProvider ? videoWarnings : []}
        busy={isProbing || isUploading || parsingState.isParsing}
        error={uploadError}
        parsingState={parsingState}
        formData={formData}
        acceptString={acceptString}
        isOver={isOver}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={isProcessingProvider ? onVideoDrop : handleDrop}
        onFileChange={
          isProcessingProvider ? onVideoFileChange : handleFileChange
        }
        onRemove={isProcessingProvider ? handleRemoveVideo : handleRemoveFile}
      />
      <IdentityQuestion />
      <WizardEligibilityNotice />
    </div>
  );
}

/**
 * "Is this you?" after a parse. Around the notice, not its condition: it
 * arrives with its own fade after a parse, and the wrapper smooths the collapse
 * after an answer (and the reopen after Change).
 */
function IdentityQuestion() {
  const {
    wizard: { importIdentity, handleRemoveFile, handleBack },
    view: { identityNoticeVisible },
    meta: { workspaceKind, preset },
  } = useUploadWizard();
  if (!identityNoticeVisible || !importIdentity.comparison) return null;
  return (
    <AnimatedHeight>
      <ImportIdentityNotice
        comparison={importIdentity.comparison}
        workspaceKind={workspaceKind}
        confirmed={importIdentity.confirmed}
        rejected={importIdentity.rejected}
        onConfirm={importIdentity.confirm}
        onReject={importIdentity.reject}
        onChangeAnswer={importIdentity.change}
        /* Clearing the file is the reset: `handleRemoveFile` bumps the file
           generation, which drops the parse, the answer and this notice with
           it. */
        onChangeFile={handleRemoveFile}
        /* Step 1 owns the who-played question, so "Change player" is Back —
           and only where there is a choice: a preset already named the
           athlete, and a personal workspace has one. */
        onChangePlayer={
          workspaceKind === "team" && !preset ? handleBack : undefined
        }
      />
    </AnimatedHeight>
  );
}

/** Step 3 — the trim window and the two camera answers. */
export function TrimStep() {
  const {
    wizard: {
      uploadedFile,
      videoProbe,
      formData,
      minTrimSeconds,
      error,
      handleTrimChange,
      handleInputChange,
    },
    view: { subjectFirstName },
  } = useUploadWizard();

  // The two camera answers. Booleans only — the fields start undefined and
  // nothing here may default them (`docs/ui-revamp-guardrails.md` §3.1).
  const onCameraAnswer = useCallback(
    (field: "fixedCamera" | "initialTopPlayerIsPlayer1", value: boolean) => {
      handleInputChange(field, value);
    },
    [handleInputChange],
  );

  return (
    <TrimStepContent
      videoFile={uploadedFile?.file ?? null}
      probe={videoProbe}
      startSeconds={formData.videoStartSeconds}
      endSeconds={formData.videoEndSeconds}
      minTrimSeconds={minTrimSeconds}
      refusal={error}
      subjectFirstName={subjectFirstName}
      fixedCamera={formData.fixedCamera}
      initialTopPlayerIsPlayer1={formData.initialTopPlayerIsPlayer1}
      onTrimChange={handleTrimChange}
      onAnswer={onCameraAnswer}
    />
  );
}

/**
 * The last step. The file was dropped a step ago and, for an export, already
 * read — so this step is the score, the players and the context, and Save
 * match is the last thing on the page.
 */
export function MatchStep() {
  const {
    wizard: {
      formData,
      handleInputChange,
      handleFormatChange,
      handleScoreChange,
      handleTiebreakChange,
      isProcessingProvider,
      whoPlayed,
      attachedLine,
      attachLine,
      detachLine,
      parsingState,
      error,
    },
    view: { scoreCheckVisible },
    actions: { dismissScoreCheck },
    meta: { workspaceKind, preset },
  } = useUploadWizard();
  const workspaces = useWorkspace();

  // `DetailsStepContent` is `memo()`-wrapped — it's the largest step body — so
  // this has to be the same object across renders that don't actually change
  // it, or the memo never bails and the whole ~1,800-line tree re-renders on
  // every unrelated wizard state change.
  const subject = useMemo(
    () => ({
      name: formData.playerName || whoPlayed.uploaderName || "You",
      isSelf: !preset && whoPlayed.subject?.kind !== "roster",
      playerId:
        whoPlayed.subject?.kind === "roster"
          ? whoPlayed.subject.playerId
          : (preset?.playerUserId ?? null),
      userId: workspaces.viewer.id,
    }),
    [
      formData.playerName,
      whoPlayed.uploaderName,
      whoPlayed.subject,
      preset,
      workspaces.viewer.id,
    ],
  );

  return (
    <DetailsStepContent
      formData={formData}
      onInputChange={handleInputChange}
      onFormatChange={handleFormatChange}
      onScoreChange={handleScoreChange}
      onTiebreakChange={handleTiebreakChange}
      isProcessingProvider={isProcessingProvider}
      workspaceKind={workspaceKind}
      subject={subject}
      preset={preset}
      attachedLine={attachedLine}
      onAttach={attachLine}
      onDetach={detachLine}
      exportRead={parsingState.parseSuccess}
      error={error}
      scoreCheckVisible={scoreCheckVisible}
      onScoreCheckDismiss={dismissScoreCheck}
    />
  );
}
