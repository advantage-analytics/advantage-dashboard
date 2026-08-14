"use client";

/**
 * UploadMatchFlow — full-page wizard shell for creating a match.
 *
 * Replaces the dialog shell that used to host these steps. The step components,
 * the step order and every piece of state still come from `useUploadMatchWizard`;
 * only the chrome differs. Two things the page gets that a fixed-height dialog
 * could not: the trim rail is as wide as the viewport allows, and finishing has
 * somewhere to land — a dialog can only close, so success was previously silent.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Check, CircleX } from "lucide-react";
import {
  Step,
  STEP_CONFIG,
  STEP_CONFIG_PROCESSING,
  CONTINUE_LABEL,
} from "./types";
import {
  useUploadMatchWizard,
  type VideoUploadEvent,
  type VideoUploadProgress,
} from "./useUploadMatchWizard";
import { formatFileSize, formatTransferSpeed } from "./utils";
import { formatEta } from "@/lib/data/match-analysis";
import { AnalysisProgressTrack } from "../analysis-progress-track";
import { StepIndicator } from "./StepIndicator";
import { ProviderContent } from "./ProviderContent";
import { UploadContent } from "./UploadContent";
import { VideoStepContent } from "./VideoStepContent";
import { VideoMetaFields } from "./VideoMetaFields";
import { DetailsContent } from "./DetailsContent";
import { ConfirmContent } from "./ConfirmContent";
import { primaryBtnCls, ghostBtnCls } from "./styles";

/** Where the flow returns to when it is dismissed or finished. */
const EXIT_HREF = "/dashboard/matches";

const CONTENT_CLS = "mx-auto w-full max-w-[820px] px-8";

/**
 * What one upload is doing, owned HERE rather than in the wizard hook.
 *
 * The wizard unmounts the instant a match is created, but its upload closure
 * runs for up to a couple of hours afterwards. This component survives that, so
 * it is the only place the progress can live.
 */
interface UploadState {
  matchId: string;
  /**
   * `done` means the bytes landed; `submitted` means the vendor took the job.
   * `submit_failed` is deliberately separate from `failed` — the video is
   * stored and the row still says `uploaded`, so it is retryable without
   * re-uploading anything.
   */
  phase:
    | "uploading"
    | "done"
    | "submitted"
    | "submit_failed"
    | "cancelled"
    | "failed";
  fileName: string;
  progress?: VideoUploadProgress;
  error?: string;
  cancel?: () => void;
}

/** One source for phase colour, so the label ink cannot disagree with the track. */
const PHASE_INK: Record<UploadState["phase"], string> = {
  uploading: "#3B82F6",
  // Uploaded but not yet handed over is still in motion, so it reads as action
  // rather than success — the green is reserved for the vendor accepting it.
  done: "#3B82F6",
  submitted: "#5DB955",
  submit_failed: "#E51837",
  cancelled: "#E51837",
  failed: "#E51837",
};

const PHASE_LABEL: Record<Exclude<UploadState["phase"], "uploading">, string> = {
  done: "Submitting…",
  submitted: "Submitted",
  submit_failed: "Not submitted",
  cancelled: "Cancelled",
  failed: "Failed",
};

export function UploadMatchFlow() {
  const [createdMatchId, setCreatedMatchId] = useState<string | null>(null);
  // Bumping this remounts the wizard, which is how "Upload another" gets a
  // clean hook rather than a hand-written reset that would drift from it.
  const [runId, setRunId] = useState(0);
  // Keyed by match, because uploads genuinely overlap: "Upload another" starts a
  // second transfer while the first is still moving bytes. A single slot meant
  // the second silently replaced the first on screen while both ran, and Cancel
  // only ever reached the newest one.
  const [uploads, setUploads] = useState<Map<string, UploadState>>(
    () => new Map()
  );

  const handleVideoUpload = useCallback((event: VideoUploadEvent) => {
    setUploads((prev) => {
      if (event.kind === "started") {
        return new Map(prev).set(event.matchId, {
          matchId: event.matchId,
          phase: "uploading",
          fileName: event.fileName,
          cancel: event.cancel,
        });
      }

      // Same Map identity when the match is unknown — returning a fresh one
      // would re-render the tree for an event we are ignoring.
      const current = prev.get(event.matchId);
      if (!current) return prev;

      const patch: Partial<UploadState> =
        event.kind === "progress"
          ? { progress: event.progress }
          : event.kind === "failed"
          ? { phase: "failed", error: event.error, cancel: undefined }
          : { phase: event.kind, cancel: undefined };

      return new Map(prev).set(event.matchId, { ...current, ...patch });
    });
  }, []);

  const active = [...uploads.values()];

  if (createdMatchId) {
    return (
      <UploadMatchSuccess
        uploads={active}
        onUploadAnother={() => {
          setCreatedMatchId(null);
          // Settled entries only. Clearing everything would hide transfers that
          // are still running, which is exactly the bug this keying fixes.
          setUploads((prev) => {
            const next = new Map(prev);
            for (const [id, u] of next) if (u.phase !== "uploading") next.delete(id);
            return next;
          });
          setRunId((n) => n + 1);
        }}
      />
    );
  }

  return (
    <UploadMatchWizard
      key={runId}
      onCreated={setCreatedMatchId}
      onVideoUpload={handleVideoUpload}
    />
  );
}

function UploadMatchSuccess({
  uploads,
  onUploadAnother,
}: {
  uploads: UploadState[];
  onUploadAnother: () => void;
}) {
  const uploading = uploads.filter((u) => u.phase === "uploading");
  const problems = uploads.filter(
    (u) =>
      u.phase === "failed" ||
      u.phase === "cancelled" ||
      u.phase === "submit_failed"
  );
  const busy = uploading.length > 0 || uploads.some((u) => u.phase === "done");

  return (
    <div className={`${CONTENT_CLS} pb-16 pt-10`}>
      <div className="animate-fadeIn flex flex-col items-center gap-3 rounded-[14px] border border-[#F3F3F3] bg-white px-10 py-12 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <div
          className="flex size-11 items-center justify-center rounded-full"
          style={{
            background:
              problems.length > 0 && !busy
                ? "rgba(229,24,55,0.08)"
                : "rgba(59,130,246,0.08)",
          }}
        >
          {problems.length > 0 && !busy ? (
            <CircleX className="size-4.5 text-[#E51837]" strokeWidth={1.5} />
          ) : (
            <Check className="size-4.5 text-[#3B82F6]" strokeWidth={1.5} />
          )}
        </div>

        <h1 className="text-[24px] font-light tracking-[-0.5px] text-[#1D1D1F]">
          Match saved.
        </h1>

        {/* The match row is committed either way. Only the video transfer is in
            doubt, so the headline never changes and this line carries the state. */}
        <p className="max-w-[440px] text-center text-[12px] leading-[1.5] text-[#525252]">
          {busy
            ? uploading.length > 1
              ? `Keep this tab open until all ${uploading.length} videos finish. The matches themselves are already safe.`
              : "Keep this tab open until the video finishes. The match itself is already safe."
            : problems.length > 0
            ? problems[0].error ??
              (problems[0].phase === "submit_failed"
                ? "Your video is stored, but it could not be sent for analysis."
                : "The video upload did not finish.")
            : "Sent for analysis. Results are added as soon as they're ready."}
        </p>

        {/* One row per transfer. Everything here comes from the browser's own
            XHR progress, so it moves continuously rather than at the
            once-a-minute cadence of the database heartbeat. */}
        {uploads.length > 0 && (
          <ul className="mt-4 flex w-full max-w-[440px] flex-col gap-4">
            {uploads.map((u) => (
              <li key={u.matchId} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-[11px]">
                  <span className="min-w-0 truncate text-[#525252]">{u.fileName}</span>
                  <span
                    className="shrink-0 tabular-nums"
                    style={{ color: PHASE_INK[u.phase] }}
                  >
                    {u.phase === "uploading"
                      ? `${(u.progress?.pct ?? 0).toFixed(1)}%`
                      : PHASE_LABEL[u.phase]}
                  </span>
                </div>

                <AnalysisProgressTrack
                  percent={
                    u.phase === "uploading" ? u.progress?.pct ?? 0 : 100
                  }
                  // `done` keeps the sheen: bytes have landed but the job is
                  // still being handed over, and a still bar would read as
                  // finished.
                  live={u.phase === "uploading" || u.phase === "done"}
                  tone={PHASE_INK[u.phase]}
                  label={`${u.fileName} ${u.phase}`}
                />

                {u.phase === "uploading" && u.progress && (
                  <div className="flex items-baseline justify-between text-[11px] text-[#AAAAAA] tabular-nums">
                    <span>
                      {formatFileSize(u.progress.bytesUploaded)} /{" "}
                      {formatFileSize(u.progress.bytesTotal)}
                    </span>
                    <span>
                      {formatTransferSpeed(u.progress.speed)} ·{" "}
                      {formatEta(u.progress.etaSeconds)}
                    </span>
                  </div>
                )}

                {u.phase === "uploading" && u.cancel && (
                  <button
                    type="button"
                    onClick={u.cancel}
                    className="self-start text-[11px] text-[#888888] underline-offset-2 transition-colors duration-200 hover:text-[#E51837] hover:underline"
                  >
                    Cancel this upload
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2 flex gap-2">
          <Button onClick={onUploadAnother} className={ghostBtnCls}>
            Upload another
          </Button>
          <Button asChild className={primaryBtnCls}>
            <Link href={EXIT_HREF}>Back to matches</Link>
          </Button>
        </div>

        {/* Leaving is allowed but not free, and the browser's own dialog fires
            too late to read as a warning. */}
        {/* Precise on purpose. beforeunload only fires on a real unload, so
            closing the tab stops the transfer but the "Back to matches" link
            directly above does not — it keeps running, just without this screen
            or its cancel button. The old line claimed leaving cancelled it,
            which was wrong in both directions. */}
        {busy && (
          <p className="mt-1 text-center text-[10px] uppercase tracking-[2px] text-[#CCCCCC]">
            Closing this tab stops {uploading.length > 1 ? "them" : "it"} · leaving this page does not
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Memoized, and not for tidiness.
 *
 * After "Upload another" this is the rendered branch while transfers are still
 * running, and every XHR progress event sets state on the parent — ~20/s per
 * upload, reconciling this subtree (DetailsContent alone is >1,200 lines and is
 * not memoized) to produce nothing visible, because the screen showing progress
 * is unmounted. Both props are stable, so this bails on every one of them.
 */
const UploadMatchWizard = memo(function UploadMatchWizard({
  onCreated,
  onVideoUpload,
}: {
  onCreated: (matchId: string) => void;
  onVideoUpload: (event: VideoUploadEvent) => void;
}) {
  const router = useRouter();

  // `onOpenChange(false)` fires both when the user backs out and when a match
  // is committed. onCreated lands first in the success path, so this ref tells
  // the two apart without the hook needing to know it is on a page.
  const createdRef = useRef(false);
  const handleCreated = useCallback(
    (matchId: string) => {
      createdRef.current = true;
      onCreated(matchId);
    },
    [onCreated]
  );
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !createdRef.current) router.push(EXIT_HREF);
    },
    [router]
  );

  const {
    step,
    selectedProvider,
    uploadedFile,
    isOver,
    isCreating,
    isUploading,
    error,
    uploadError,
    formData,
    parsingState,
    handleProviderSelect,
    handleProviderContinue,
    handleVideoContinue,
    handleMatchContinue,
    handleBack,
    setIsOver,
    handleDrop,
    handleFileChange,
    handleRemoveFile,
    handleInputChange,
    handleScoreChange,
    handleTiebreakChange,
    handleCreateMatch,
    pendingDetailFocus,
    goEditDetail,
    consumePendingDetailFocus,
    stepOrder,
    isProcessingProvider,
    videoProbe,
    videoWarnings,
    isProbing,
    minTrimSeconds,
    remainingQuotaSeconds,
    acceptString,
    requirementChips,
    onVideoPick,
    handleTrimChange,
    handleRemoveVideo,
  } = useUploadMatchWizard({
    open: true,
    onOpenChange: handleOpenChange,
    onCreated: handleCreated,
    onVideoUpload,
  });

  const contentRef = useRef<HTMLDivElement>(null);

  const onDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsOver(true);
    },
    [setIsOver]
  );
  const onDragLeave = useCallback(() => setIsOver(false), [setIsOver]);

  // Stable so memo(VideoStepContent) can actually skip renders — an inline
  // arrow here made its shallow compare fail on every parent render.
  const onVideoDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsOver(false);
      onVideoPick(e.dataTransfer.files?.[0] ?? null);
    },
    [setIsOver, onVideoPick]
  );

  const continueHandler =
    step === "provider" ? handleProviderContinue
    : step === "video" ? handleVideoContinue
    : step === "match" ? handleMatchContinue
    : handleCreateMatch;

  const currentStepIndex = stepOrder.indexOf(step);
  const { title, description } = {
    ...STEP_CONFIG[step],
    ...(isProcessingProvider ? STEP_CONFIG_PROCESSING[step] : undefined),
  };

  // Per-step gate. A table rather than a ternary chain so a new step is one
  // entry rather than an edit threaded through three chained conditionals.
  const trimSelected =
    (formData.videoEndSeconds ?? 0) - (formData.videoStartSeconds ?? 0);

  // Mirrors what buildSplitStepJobRequest() accepts: at least one set with a
  // game count above zero. Three sets of 0-0 is a well-formed payload that
  // describes a match nobody played, and the vendor would take it.
  const hasAnySetScore =
    formData.playerScores.some((n) => (n ?? 0) > 0) ||
    formData.opponentScores.some((n) => (n ?? 0) > 0);

  // A video job's metadata is not optional the way an imported match's is: every
  // one of these is a REQUIRED field in the vendor's job payload, and a job that
  // reaches them incomplete is refused after the video has already uploaded.
  // Blocking here costs a click; blocking there costs an hour of transfer.
  //
  // Only for processing providers. A SwingVision import gets its scores from the
  // parsed file, so demanding them by hand would be asking twice.
  const videoMetaBlocker = !isProcessingProvider
    ? null
    : !formData.opponentName.trim()
    ? "Add your opponent's name"
    : !hasAnySetScore
    ? "Enter the set scores"
    : formData.initialTopPlayerIsPlayer1 === undefined
    ? "Pick which end you started on"
    : formData.fixedCamera === undefined
    ? "Tell us about the camera"
    : formData.adScoring === undefined
    ? "Choose ad or no-ad scoring"
    : null;

  const stepBlockers: Record<Step, string | null> = {
    provider: !selectedProvider ? "Make a selection" : null,
    video: isProbing
      ? "Checking your video…"
      : !uploadedFile
      ? "Drop or browse a video"
      : trimSelected < minTrimSeconds
      ? "Widen the trim window"
      : null,
    match: !uploadedFile
      ? "Drop or browse a file"
      : isUploading
      ? "Validating file…"
      : !formData.eventName.trim()
      ? "Add a match name"
      : videoMetaBlocker,
    confirm: isCreating ? "Creating match…" : null,
  };

  // Non-null means "cannot continue", and the string doubles as the footer hint
  // explaining why. Read once so the two uses cannot disagree.
  const blocker = stepBlockers[step];
  const continueDisabled = blocker !== null;

  // Platform detection for the right modifier glyph in the footer hint. Gated
  // behind null until mounted so SSR doesn't render a Mac chord on a Linux box.
  const [isMac, setIsMac] = useState<boolean | null>(null);
  useEffect(() => {
    const platform =
      // @ts-expect-error - userAgentData is widely supported but not yet in lib.dom
      navigator.userAgentData?.platform ?? navigator.platform ?? "";
    setIsMac(/Mac|iPhone|iPad|iPod/i.test(platform));
  }, []);

  // Tracks whether focus currently lives inside a form control. Drives the
  // footer hint swap — when the user is mid-typing, plain Enter is suppressed
  // so we surface ⌘/Ctrl↵ instead.
  const [focusInForm, setFocusInForm] = useState(false);
  useEffect(() => {
    const isFormControl = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        node.isContentEditable ||
        node.getAttribute("role") === "combobox"
      );
    };
    const onFocusIn = (e: FocusEvent) => setFocusInForm(isFormControl(e.target));
    const onFocusOut = () => setFocusInForm(false);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  // Keyboard:
  //   • Plain Enter advances the wizard when focus is outside form controls
  //     (so score-entry and dropdowns keep their native Enter semantics —
  //     focus chain in DetailsContent, opening selects, etc.).
  //   • ⌘/Ctrl+Enter advances *focus* to the next field — same idea as Tab,
  //     but reachable without the user having to retrain pinkies. Submitting
  //     the wizard is reserved for the explicit Continue button so a fast-typed
  //     chord can never skip a missed field.
  //   • Esc steps back when there's a previous step. On the first step it does
  //     nothing: leaving is a deliberate click, not a stray keypress.
  useEffect(() => {
    const focusNextField = () => {
      // Walk forward through the step content's tabbables. When the user runs
      // out of fields, fall through to the Continue button so the terminal
      // chord lands on submit instead of silently no-op'ing.
      const root = contentRef.current;
      if (!root) return;
      const list = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a, button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      const idx = list.indexOf(document.activeElement as HTMLElement);
      if (idx === -1) return;
      const inFieldNext = list[idx + 1];
      if (inFieldNext) {
        inFieldNext.focus();
        // Select text inputs so the next keystroke replaces, matching the
        // behavior of tabbing into a numeric score cell.
        if (
          inFieldNext instanceof HTMLInputElement &&
          /text|number|search|email|url/i.test(inFieldNext.type || "text")
        ) {
          inFieldNext.select();
        }
        return;
      }
      // Walked past the last field — hand focus to Continue with a one-shot
      // ring pulse so the chord-to-submit handoff isn't silent.
      const cta = document.querySelector<HTMLElement>('[data-wizard-continue]:not([disabled])');
      if (!cta) return;
      cta.focus();
      cta.classList.remove("animate-chord-pulse");
      // Force a reflow so re-adding the class restarts the animation if it
      // was already mid-flight from a prior chord press.
      void cta.offsetWidth;
      cta.classList.add("animate-chord-pulse");
      const onEnd = () => {
        cta.classList.remove("animate-chord-pulse");
        cta.removeEventListener("animationend", onEnd);
      };
      cta.addEventListener("animationend", onEnd);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step !== "provider") {
        // Bail when a transient popup is open — Esc should close that first,
        // not pop the wizard step. Covers native <select> dropdowns (browser
        // closes them on Esc), open comboboxes (aria-expanded="true"), and
        // the InfoTooltip popover (role="tooltip" mounts only while open).
        const active = document.activeElement as HTMLElement | null;
        const inSelect = active?.tagName === "SELECT";
        const openCombobox = !!document.querySelector('[aria-expanded="true"]');
        const tooltipOpen = !!document.querySelector('[role="tooltip"]');
        if (inSelect || openCombobox || tooltipOpen) return;
        e.preventDefault();
        e.stopPropagation();
        handleBack();
        return;
      }
      if (e.key !== "Enter" || e.shiftKey || e.altKey) return;

      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        focusNextField();
        return;
      }

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (target.isContentEditable) return;
        if (target.getAttribute("role") === "combobox") return;
      }
      if (continueDisabled) return;
      e.preventDefault();
      continueHandler();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [continueDisabled, continueHandler, step, handleBack]);

  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col">
      <div className={`${CONTENT_CLS} pb-10 pt-7`}>
        <StepIndicator currentStep={currentStepIndex} totalSteps={stepOrder.length} />

        <h1 className="mt-6 text-[24px] font-light leading-[30px] tracking-[-0.5px] text-[#1D1D1F]">
          {title}
        </h1>
        <p className="mt-1.5 max-w-[460px] text-[12px] leading-[1.5] text-[#525252]">
          {description}
        </p>

        <div ref={contentRef} key={step} className="animate-fadeIn mt-7">
          {step === "provider" && (
            <ProviderContent
              selectedProvider={selectedProvider}
              onProviderSelect={handleProviderSelect}
            />
          )}

          {step === "video" && (
            <VideoStepContent
              videoFile={uploadedFile?.file ?? null}
              probe={videoProbe}
              warnings={videoWarnings}
              isProbing={isProbing}
              error={uploadError}
              startSeconds={formData.videoStartSeconds}
              endSeconds={formData.videoEndSeconds}
              isOver={isOver}
              minTrimSeconds={minTrimSeconds}
              remainingQuotaSeconds={remainingQuotaSeconds}
              acceptString={acceptString}
              requirementChips={requirementChips}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onVideoDrop}
              onPick={onVideoPick}
              onTrimChange={handleTrimChange}
              onRemove={handleRemoveVideo}
            />
          )}

          {step === "match" && (
            <div className="flex flex-col gap-6">
              {/* Processing providers already picked their video on the
                  previous step — this step is metadata only. */}
              {isProcessingProvider ? (
                <VideoMetaFields formData={formData} onInputChange={handleInputChange} />
              ) : (
                <UploadContent
                  selectedProvider={selectedProvider}
                  uploadedFile={uploadedFile}
                  isOver={isOver}
                  isUploading={isUploading}
                  uploadError={uploadError}
                  parsingState={parsingState}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={handleDrop}
                  onFileChange={handleFileChange}
                  onRemoveFile={handleRemoveFile}
                />
              )}
              {uploadedFile && !parsingState.isParsing && (
                <DetailsContent
                  formData={formData}
                  onInputChange={handleInputChange}
                  onScoreChange={handleScoreChange}
                  onTiebreakChange={handleTiebreakChange}
                  pendingDetailFocus={pendingDetailFocus}
                  onPendingDetailFocusConsumed={consumePendingDetailFocus}
                />
              )}
            </div>
          )}

          {step === "confirm" && (
            <ConfirmContent
              formData={formData}
              uploadedFile={uploadedFile}
              error={error}
              onEditDetail={goEditDetail}
              isProcessingProvider={isProcessingProvider}
            />
          )}
        </div>
      </div>

      {/* Footer sticks to the bottom of the viewport so the primary action is
          reachable without scrolling to the end of a long form.

          White on a hairline, matching the app header rather than the tinted
          bar this had while it was a dialog footer. In a dialog the tint
          separated the action row from the body; on a page it was a full-bleed
          grey band under a centred 820px column, weighted to nothing in the
          composition. The header is the only other persistent chrome in the
          dashboard and it is white, so this follows it. The border is
          unconditional where the header's is scroll-triggered: the header at
          scroll-top is genuinely part of the page, while an action bar is
          always chrome and should always be delineated. */}
      <div className="sticky bottom-0 mt-auto border-t border-[#F3F3F3] bg-white">
        <div className={`${CONTENT_CLS} flex items-center justify-between py-3.5`}>
          <div className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
            {blocker !== null ? (
              <span>{blocker}</span>
            ) : (
              <>
                <span>Press</span>
                {/* When focus is mid-form, plain Enter is suppressed so we surface
                    the chord users can still rely on. Platform-detected per
                    SKILL.md › Keyboard Shortcut Chip conventions: ⌘ on Mac
                    concatenates without `+`, Ctrl+ elsewhere. Render is gated
                    until isMac resolves to avoid SSR mismatches. */}
                <kbd
                  aria-hidden="true"
                  className="inline-block rounded bg-[#F0F0F0] px-1 py-0.5 text-[10px] font-medium leading-none text-[#AAAAAA]"
                >
                  {focusInForm && isMac !== null ? (isMac ? "⌘↵" : "Ctrl+↵") : "↵"}
                </kbd>
                <span>
                  {focusInForm
                    ? "to next field"
                    : step === "confirm"
                    ? "to create"
                    : "to continue"}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {currentStepIndex > 0 ? (
              <Button onClick={handleBack} className={ghostBtnCls}>
                Back
              </Button>
            ) : (
              <Button asChild className={ghostBtnCls}>
                <Link href={EXIT_HREF}>Cancel</Link>
              </Button>
            )}
            <Button
              onClick={continueHandler}
              disabled={continueDisabled}
              data-wizard-continue
              className={primaryBtnCls}
            >
              {isCreating ? "Creating…" : CONTINUE_LABEL[step]}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});
