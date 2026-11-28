"use client";

import { AdvSelect } from "@/components/ui/adv-select";
import { useAdminWizardMode, AdminResultLock } from "./admin-mode";
import { AdminBillingField, AdminWorkspaceRow } from "./AdminTargetField";
import { useCallback, useMemo } from "react";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { isProgramStaff } from "@/lib/workspace/types";
import { canSaveRosterStyle } from "./style-save-offer";
import { AnimatedHeight } from "./AnimatedHeight";
import { DetailsStepContent } from "./DetailsStepContent";
import { workspaceLabel } from "./RosterMenu";
import { teammateOptions } from "./teammates";
import { EligibilityNotice } from "./EligibilityNotice";
import { FileStepContent } from "./FileStepContent";
import { ImportIdentityNotice } from "./ImportIdentityNotice";
import { SourceStepContent } from "./SourceStepContent";
import { TrimStepContent } from "./TrimStepContent";
import { useAddSelfOffer } from "./useAddSelfOffer";
import { useUploadWizard } from "./UploadWizardProvider";
import { WizardNotice } from "./WizardNotice";
import { ArrowRight, Info, XCircle } from "lucide-react";
import {
  fileStepHoursNote,
  type FileStepHoursNote,
} from "@/lib/billing/checkout-view";
import { formatHoursLong } from "@/lib/data/usage-format";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import { errorStripCls, noteIconCls, noteStripCls } from "./styles";

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
      discipline,
      handleDisciplineSelect,
      whoPlayed,
      providerQuotaRefusal,
    },
  } = useUploadWizard();
  const addSelf = useAddSelfOffer(whoPlayed);
  const admin = useAdminWizardMode();
  // The console's own Workspace row and billing field. Not for a prepared
  // attachment: its target is the recorded match, fixed before this step.
  // Keyed on the mode's stable parts: the console rebuilds the mode object
  // itself on every render of its page.
  const adminContext = admin && !admin.attachment ? admin.context : null;
  const adminKind = admin?.uploadKind;
  const adminSlots = useMemo(
    () =>
      adminContext
        ? {
            workspace: (
              <AdminWorkspaceRow
                context={adminContext}
                uploadKind={adminKind}
              />
            ),
            billing: (
              <AdminBillingField
                context={adminContext}
                uploadKind={adminKind}
              />
            ),
            player: adminContext.owner?.viewer.name ?? null,
          }
        : null,
    [adminContext, adminKind],
  );
  return (
    <div className="flex flex-col gap-9">
      <SourceStepContent
        selectedProvider={selectedProvider}
        onProviderSelect={handleProviderSelect}
        discipline={discipline}
        onDisciplineSelect={handleDisciplineSelect}
        whoPlayed={whoPlayed}
        addSelf={addSelf.offer}
        admin={adminSlots}
        /* Null for an import source and while the allowance is still
           loading — the hook decides both, so this step never has to. */
        quotaRefusal={providerQuotaRefusal}
      />
      <WizardEligibilityNotice />
      {addSelf.dialog}
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
    videoNotes,
    videoNotices,
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
    plansActive,
    quotaPlanId,
    quotaPastDue,
    remainingQuotaSeconds,
    openAddHours,
  } = wizard;

  // Hours are the news on this step in two cases only — see
  // `fileStepHoursNote()`. Never on the import path: an export is free.
  const hoursNote = fileStepHoursNote({
    enabled: plansActive && isProcessingProvider,
    plan: quotaPlanId,
    remainingSeconds: remainingQuotaSeconds,
    videoSeconds: uploadedFile ? videoProbe?.durationSeconds : null,
    pastDue: quotaPastDue,
  });

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

  // Memoised on what it says, so memo(FileStepContent) still skips renders:
  // `fileStepHoursNote()` hands back a fresh object every render.
  const hoursLeft = hoursNote.kind === "too-long" ? hoursNote.leftSeconds : 0;
  const hoursNoteNode = useMemo(
    () =>
      hoursNote.kind === "none" ? null : (
        <FileHoursNote note={hoursNote} onSeePlans={openAddHours} />
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on what the note says
    [hoursNote.kind, hoursLeft, openAddHours],
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
        notes={isProcessingProvider ? videoNotes : []}
        notices={isProcessingProvider ? videoNotices : []}
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
        // One grey strip per place: the hours note takes the "Nothing is
        // uploading yet" strip's slot under the drop zone / file row.
        hoursNote={hoursNoteNode}
      />
      <OutOfHoursNotice />
      <IdentityQuestion />
      <WizardEligibilityNotice />
    </div>
  );
}

/**
 * The file step's one-line hours note, once plans are on sale: grey, because
 * nothing is wrong and nothing is refused here — paying happens at Send. One
 * line, never wrapped; "See plans" opens the checkout dialog in place, so a
 * video already picked stays picked.
 */
/** The note `fileStepHoursNote()` calls for, in the wizard's words. */
export function FileHoursNote({
  note,
  onSeePlans,
}: {
  note: FileStepHoursNote;
  onSeePlans: () => void;
}) {
  if (note.kind === "no-hours") {
    return (
      <HoursNote
        lead="No video hours yet."
        rest="You'll choose a plan or buy hours before it's analyzed."
        onSeePlans={() => onSeePlans()}
      />
    );
  }
  if (note.kind === "past-due") {
    return (
      <HoursNote
        lead="Your last payment failed."
        rest="Update your card to get this month's hours."
      />
    );
  }
  if (note.kind === "too-long") {
    return (
      <HoursNote
        lead={`This video is longer than your ${formatHoursLong(note.leftSeconds)} left.`}
        rest="Trim it first; you can add hours before it's sent."
      />
    );
  }
  return null;
}

function HoursNote({
  lead,
  rest,
  onSeePlans,
}: {
  lead: string;
  rest: string;
  onSeePlans?: () => void;
}) {
  return (
    <div className={noteStripCls} role="status">
      <Info
        className={cn(noteIconCls, "text-[var(--ink-400)]")}
        strokeWidth={1.5}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium text-[var(--ink-900)]">{lead}</span> {rest}
      </span>
      {onSeePlans && (
        <button
          type="button"
          onClick={onSeePlans}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-[12px] text-[var(--blue)] hover:text-[var(--blue-hover)]"
        >
          See plans
          <ArrowRight className="size-3" strokeWidth={1.75} aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * B4 in the Credit Packs Mockups (docs/plans/2027-player-pricing.md): a personal player with no free hours and no
 * credits hears it on the file step, before anyone waits on an upload — with
 * the one way forward. Before plans are on sale only (`plansActive` hands the
 * step to `FileHoursNote`). Never on the import path (SwingVision is free), never
 * for a team, and not while the reading is still loading.
 */
function OutOfHoursNotice() {
  const {
    wizard: {
      isProcessingProvider,
      remainingQuotaSeconds,
      freeHoursReturnOn,
      openAddHours,
      canBuyCredits,
      plansActive,
    },
  } = useUploadWizard();

  if (
    // Once plans are on sale the file step says it with the grey hours note
    // above the drop zone instead; this is the beta's credit-pack notice.
    plansActive ||
    !canBuyCredits ||
    !isProcessingProvider ||
    remainingQuotaSeconds === undefined ||
    remainingQuotaSeconds > 0
  ) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={errorStripCls} role="alert">
        <XCircle className={noteIconCls} strokeWidth={1.5} aria-hidden />
        <span>
          <span className="font-medium">You&rsquo;re out of video hours.</span>{" "}
          {freeHoursReturnOn
            ? `Free hours come back ${freeHoursReturnOn}, or add credits to send a match now.`
            : "Add credits to send a match now."}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => openAddHours()}
          className={advButton("outline", "sm")}
        >
          Add hours
        </button>
        <span className="text-[11px] text-[var(--ink-500)]">
          From $14 · SwingVision imports are always free
        </span>
      </div>
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
      topPlayerAnswerStale,
      handleInputChange,
    },
    view: { subjectFirstName, firstUpload },
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
      topPlayerAnswerStale={topPlayerAnswerStale}
      firstUpload={firstUpload}
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
  const admin = useAdminWizardMode();
  const {
    wizard: {
      formData,
      handleInputChange,
      handleFormatChange,
      handleScoreChange,
      handleTiebreakChange,
      isProcessingProvider,
      uploadedFile,
      videoProbe,
      whoPlayed,
      attachedLine,
      attachLine,
      detachLine,
      parsingState,
      error,
    },
    view: { scoreCheckVisible, oneSetSettled, trimSelected, flaggedMissing },
    actions: { dismissScoreCheck, chooseOneSet, undoOneSet },
    meta: { workspaceKind, preset },
  } = useUploadWizard();
  const workspaces = useWorkspace();
  const adminOwner = admin?.context.owner ?? null;

  // `DetailsStepContent` is `memo()`-wrapped — it's the largest step body — so
  // this has to be the same object across renders that don't actually change
  // it, or the memo never bails and the whole ~1,800-line tree re-renders on
  // every unrelated wizard state change.
  const subject = useMemo(() => {
    const playerId =
      whoPlayed.subject?.kind === "roster"
        ? whoPlayed.subject.playerId
        : (preset?.playerUserId ?? null);
    // The roster row behind the pick, when there is one — what its saved hand
    // and backhand are, and whether "use for future matches" has a profile to
    // write to. A preset's player is looked up the same way; a personal
    // workspace has no roster, so this is null there.
    const rosterRow =
      playerId === null
        ? undefined
        : whoPlayed.roster?.find((row) => row.playerId === playerId);
    return {
      name: formData.playerName || whoPlayed.uploaderName || "You",
      // The console's player upload is the player's own match, but not the
      // signed-in person's: nothing on it says "you".
      isSelf: !preset && whoPlayed.subject?.kind !== "roster" && !adminOwner,
      playerId,
      userId: workspaces.viewer.id,
      rosterStyle: rosterRow ?? null,
      canSaveStyle:
        rosterRow !== undefined &&
        canSaveRosterStyle({
          staff: isProgramStaff(workspaces.active),
          rowUserId: rosterRow.userId,
          viewerId: workspaces.viewer.id,
        }),
    };
  }, [
    formData.playerName,
    whoPlayed.uploaderName,
    whoPlayed.subject,
    whoPlayed.roster,
    preset,
    workspaces.viewer.id,
    workspaces.active,
    adminOwner,
  ]);

  // The opponent menu's Teammates section: the program's roster minus whoever
  // this match is for. A team workspace's only, and only with somebody in it.
  // Stable for the same reason as `subject`.
  const subjectPlayerId = subject.playerId;
  const teammates = useMemo(() => {
    if (workspaceKind !== "team") return null;
    const players = teammateOptions(whoPlayed.roster, subjectPlayerId);
    if (players.length === 0) return null;
    const program =
      workspaces.available.find(
        (w) => w.kind === "team" && w.id === whoPlayed.programId,
      ) ?? (workspaces.active.kind === "team" ? workspaces.active : null);
    return {
      label: program ? `Teammates · ${workspaceLabel(program)}` : "Teammates",
      players,
    };
  }, [
    workspaceKind,
    whoPlayed.roster,
    whoPlayed.programId,
    subjectPlayerId,
    workspaces.available,
    workspaces.active,
  ]);

  // Stable for the same reason as `subject`. Only while the File itself is
  // held: a restored draft brings back the form, not the video.
  const heldFile = isProcessingProvider ? (uploadedFile?.file ?? null) : null;
  const videoName = uploadedFile?.name;
  const videoSize = uploadedFile?.size;
  const video = useMemo(
    () =>
      heldFile
        ? {
            file: heldFile,
            name: videoName ?? heldFile.name,
            size: videoSize ?? "",
            probe: videoProbe,
            keptSeconds: trimSelected > 0 ? trimSelected : null,
          }
        : null,
    [heldFile, videoName, videoSize, videoProbe, trimSelected],
  );

  if (admin?.attachment)
    return (
      <div className="flex flex-col gap-6">
        <p>
          The recorded result is preserved. The server checks the selected
          analysis against it.
        </p>
        <AdminResultLock>
          <p>
            {admin.attachment.preset.playerName} vs{" "}
            {admin.attachment.preset.opponentName} ·{" "}
            {admin.attachment.preset.date}
          </p>
          <p>
            {admin.attachment.preset.score?.player1
              .map(
                (n, i) =>
                  `${n ?? "–"}–${admin.attachment!.preset.score!.player2[i] ?? "–"}`,
              )
              .join(" ")}
          </p>
          <p>
            {admin.attachment.preset.surface ?? "Surface not recorded"} · Best
            of {admin.attachment.preset.bestOf} ·{" "}
            {admin.attachment.preset.discipline ?? "singles"}
          </p>
          {admin.attachment.preset.eventName && (
            <p>
              {admin.attachment.preset.eventName} ·{" "}
              {admin.attachment.preset.round}
            </p>
          )}
          {admin.attachment.preset.ending && (
            <p>{admin.attachment.preset.ending}</p>
          )}
        </AdminResultLock>
        {isProcessingProvider && (
          <label>
            Scoring rule
            <AdvSelect
              kind="underline"
              aria-label="Scoring rule"
              disabled={admin.attachment.preset.adScoring != null}
              value={
                formData.adScoring == null ? "" : String(formData.adScoring)
              }
              onChange={(e) =>
                handleInputChange("adScoring", e.target.value === "true")
              }
            >
              <option value="" disabled>
                Choose scoring
              </option>
              <option value="true">Advantage</option>
              <option value="false">No-ad</option>
            </AdvSelect>
          </label>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
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
      teammates={teammates}
      preset={preset}
      attachedLine={attachedLine}
      onAttach={attachLine}
      onDetach={detachLine}
      exportRead={parsingState.parseSuccess}
      error={error}
      scoreCheckVisible={scoreCheckVisible}
      onScoreCheckDismiss={dismissScoreCheck}
      oneSetSettled={oneSetSettled}
      onOneSet={chooseOneSet}
      onUndoOneSet={undoOneSet}
      video={video}
      flaggedMissing={flaggedMissing}
    />
  );
}
