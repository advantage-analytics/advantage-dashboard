"use client";

/**
 * UploadMatchFlow — full-page wizard for creating a match.
 *
 * Two screens: the wizard, and where finishing lands. The step components, the
 * step order and every piece of state come from `useUploadMatchWizard`, lifted
 * into `UploadWizardProvider`; this file composes the shell, the step bodies
 * and the footer pieces, and owns the one thing that outlives the wizard — the
 * video uploads still moving after the match row is written.
 *
 * Composition, not configuration: each step body (`UploadWizardSteps.tsx`) and
 * each footer slot (`UploadWizardFooter.tsx`) reads the wizard context and
 * decides its own rendering, so this file says WHAT is on the page and nothing
 * about how the state behind it is managed.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { ProviderId } from "@/lib/services/upload";
import type { EventPreset, MatchDraft } from "./types";
import type { RosterSubject, VideoUploadEvent } from "./useUploadMatchWizard";
import { PinnedLineBar } from "./PinnedLineBar";
import { UploadMatchSuccess } from "./UploadMatchSuccess";
import {
  UploadWizardProvider,
  useUploadWizard,
  type UploadWizardProviderProps,
} from "./UploadWizardProvider";
import {
  SaveDraftButton,
  WizardFooterStatus,
  WizardQuotaMeter,
} from "./UploadWizardFooter";
import {
  DraftNotices,
  FileStep,
  MatchStep,
  ProviderStep,
  TrimStep,
} from "./UploadWizardSteps";
import {
  applyVideoUploadEvent,
  type CreatedMatch,
  type UploadState,
} from "./upload-progress";
import { WizardShell } from "./WizardShell";

/** Where the flow returns to when it is dismissed or finished. */
const PERSONAL_EXIT_HREF = "/dashboard/matches";

export function UploadMatchFlow({
  preset: initialPreset,
  draft,
  draftRefusal,
  initialProvider,
  initialSubject,
}: {
  preset?: EventPreset | null;
  draft?: MatchDraft | null;
  /**
   * Why the `?draft=` in the URL was not resumed — the page's own sentence
   * (`draftWorkspaceRefusal()`), already worded. Arrives WITH `draft: null`:
   * a refused draft is not a half-applied one, so nothing of it — not the
   * preset, not the attached line, not a single form answer — reaches the
   * wizard, and this only explains the empty flow the person is looking at.
   */
  draftRefusal?: string | null;
  /** A source named by the link that opened the wizard — see the hook. */
  initialProvider?: ProviderId | null;
  /** A roster player named by the link that opened the wizard — see the hook. */
  initialSubject?: RosterSubject | null;
} = {}) {
  // The line this flow is filling. State rather than the prop because the
  // pinned bar's Change menu swaps it for another line of the same event
  // (design 10a) without leaving the page — the file already dropped stays.
  const [preset, setPreset] = useState<EventPreset | null>(
    initialPreset ?? draft?.preset ?? null,
  );
  // A team upload came from a line and goes back to it. A personal one has the
  // matches list, which is where its match will appear.
  const EXIT_HREF = preset?.eventHref ?? PERSONAL_EXIT_HREF;
  const [created, setCreated] = useState<CreatedMatch | null>(null);
  // Read by the failure listener below, which is registered once. Set where
  // `created` is, rather than mirrored from it by an effect.
  const createdRef = useRef<CreatedMatch | null>(null);
  const handleCreated = useCallback((match: CreatedMatch) => {
    createdRef.current = match;
    setCreated(match);
  }, []);
  /**
   * Set when the wizard rolled the new row back — the job insert or an
   * import's file upload failed after the match was written. The match is
   * gone, so the screen must stop offering to open it. Cleared with `created`.
   */
  const [removedError, setRemovedError] = useState<string | null>(null);
  // Bumping this remounts the wizard, which is how "Upload another" gets a
  // clean hook rather than a hand-written reset that would drift from it.
  const [runId, setRunId] = useState(0);
  // The wizard unmounts the instant a match is created, but its upload closure
  // runs for up to a couple of hours afterwards. This component survives that,
  // so it is the only place the progress can live. Keyed by match so a late
  // event from an earlier run can never land on the match now on screen —
  // "Upload another" opens a new tab while anything is still moving, so the
  // screen itself only ever shows one.
  const [uploads, setUploads] = useState<Map<string, UploadState>>(
    () => new Map(),
  );

  const handleVideoUpload = useCallback((event: VideoUploadEvent) => {
    setUploads((prev) => applyVideoUploadEvent(prev, event));
  }, []);

  // `match-upload-failed` is the wizard's only word for the failures that
  // happen OUTSIDE the video transfer: the processing-job insert, and an
  // import's file upload. Neither reaches `onVideoUpload`, so without this the
  // screen would wait on an upload that is never going to start. A transfer
  // failure dispatches it too, but its own `"failed"` event is already here and
  // wins — see the `has` guard.
  useEffect(() => {
    function onFailure(event: Event) {
      const match = createdRef.current;
      if (!match) return;
      const detail = (event as CustomEvent).detail as
        | { matchId?: string; removedMatchId?: string; error?: string }
        | undefined;
      const error = detail?.error || "The upload stopped before it completed.";
      // The row was rolled back. Only this match's rollback counts: after an
      // in-place "Upload another", an earlier run's late one names its own.
      if (detail?.removedMatchId) {
        if (detail.removedMatchId === match.matchId) setRemovedError(error);
        return;
      }
      if (!detail?.matchId) return;
      if (detail.matchId !== match.matchId) return;
      setUploads((prev) =>
        prev.has(match.matchId)
          ? prev
          : applyVideoUploadEvent(prev, {
              matchId: match.matchId,
              kind: "failed",
              error,
            }),
      );
    }
    window.addEventListener("match-upload-failed", onFailure);
    return () => window.removeEventListener("match-upload-failed", onFailure);
  }, []);

  if (created) {
    return (
      <UploadMatchSuccess
        match={created}
        upload={uploads.get(created.matchId) ?? null}
        removedError={removedError}
        exitHref={EXIT_HREF}
        preset={preset}
        onResubmitted={() =>
          setUploads((prev) =>
            applyVideoUploadEvent(prev, {
              matchId: created.matchId,
              kind: "submitted",
            }),
          )
        }
        onUploadAnother={() => {
          // Nothing is running when this restarts in place — "Upload another"
          // opens a new tab while anything is — so no upload is left to keep.
          createdRef.current = null;
          setCreated(null);
          setRemovedError(null);
          setUploads(new Map());
          setRunId((n) => n + 1);
        }}
      />
    );
  }

  return (
    <UploadMatchWizard
      // The seeded player is part of the identity, not just the run: the hook
      // installs it as initial state, and `/dashboard/matches/new?player=A` →
      // `?player=B` is one route with new search params, which re-renders the
      // wizard rather than remounting it. Without this the second visit would
      // show B's name over A's id — the name/id mismatch the For field exists
      // to prevent. No linked path does that today; the key is what keeps it
      // from mattering if one is ever added.
      key={`${runId}:${initialSubject?.playerId ?? ""}`}
      onCreated={handleCreated}
      onVideoUpload={handleVideoUpload}
      exitHref={EXIT_HREF}
      preset={preset}
      onSwitchPreset={setPreset}
      draft={draft ?? null}
      draftRefusal={draftRefusal ?? null}
      initialProvider={initialProvider ?? null}
      initialSubject={initialSubject ?? null}
    />
  );
}

/**
 * Memoized, as cheap insurance.
 *
 * Every prop is stable, so any parent re-render bails here instead of
 * reconciling this subtree (DetailsStepContent alone is >1,200 lines and is not
 * memoized). "Upload another" only restarts in place once nothing is uploading,
 * so progress events no longer arrive while it is mounted — but a stray late
 * event would otherwise re-render the whole wizard for nothing visible.
 */
const UploadMatchWizard = memo(function UploadMatchWizard(
  props: Omit<UploadWizardProviderProps, "children">,
) {
  return (
    <UploadWizardProvider {...props}>
      <UploadWizardPage />
    </UploadWizardProvider>
  );
});

/** The shell, with the step body and footer pieces composed into its slots. */
function UploadWizardPage() {
  const {
    wizard: { step, stepOrder, progressTotalSteps, firstStep, handleBack },
    view: { title, description, continueLabel, continueDisabled },
    actions,
    meta: { contentRef, exitHref, preset, onSwitchPreset },
  } = useUploadWizard();

  return (
    <WizardShell
      stepIndex={stepOrder.indexOf(step)}
      stepCount={progressTotalSteps}
      title={title}
      description={description}
      pinned={
        /* Step 1, already answered: the line this flow is filling, pinned. */
        preset && (
          <PinnedLineBar
            preset={preset}
            onSwitch={onSwitchPreset}
            outsideHref="/dashboard/matches/new"
          />
        )
      }
      contentRef={contentRef}
      contentKey={step}
      contentClassName={step === "match" ? "mt-9" : "mt-[52px]"}
      back={step !== firstStep ? handleBack : undefined}
      cancelHref={exitHref}
      meter={<WizardQuotaMeter />}
      status={<WizardFooterStatus />}
      secondary={<SaveDraftButton />}
      continueLabel={continueLabel}
      onContinue={actions.continue}
      continueDisabled={continueDisabled}
    >
      <DraftNotices />
      {step === "provider" && <ProviderStep />}
      {step === "file" && <FileStep />}
      {step === "trim" && <TrimStep />}
      {step === "match" && <MatchStep />}
    </WizardShell>
  );
}
