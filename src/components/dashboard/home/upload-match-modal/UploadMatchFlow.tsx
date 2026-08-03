"use client";

/**
 * UploadMatchFlow — full-page wizard shell for creating a match.
 *
 * Replaces the dialog shell that used to host these steps. The step components,
 * the step order and every piece of state still come from `useUploadMatchModal`;
 * only the chrome differs. Two things the page gets that a fixed-height dialog
 * could not: the trim rail is as wide as the viewport allows, and finishing has
 * somewhere to land — a dialog can only close, so success was previously silent.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import {
  Step,
  STEP_CONFIG,
  STEP_CONFIG_PROCESSING,
  CONTINUE_LABEL,
} from "./types";
import { useUploadMatchModal } from "./useUploadMatchModal";
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

export function UploadMatchFlow() {
  const [createdMatchId, setCreatedMatchId] = useState<string | null>(null);
  // Bumping this remounts the wizard, which is how "Upload another" gets a
  // clean hook rather than a hand-written reset that would drift from it.
  const [runId, setRunId] = useState(0);

  if (createdMatchId) {
    return (
      <UploadMatchSuccess
        onUploadAnother={() => {
          setCreatedMatchId(null);
          setRunId((n) => n + 1);
        }}
      />
    );
  }

  return <UploadMatchWizard key={runId} onCreated={setCreatedMatchId} />;
}

function UploadMatchSuccess({ onUploadAnother }: { onUploadAnother: () => void }) {
  return (
    <div className={`${CONTENT_CLS} pb-16 pt-10`}>
      <div className="animate-fadeIn flex flex-col items-center gap-3 rounded-[14px] border border-[#F3F3F3] bg-white px-10 py-12 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <div className="flex size-11 items-center justify-center rounded-full bg-[#3B82F6]/[0.08]">
          <Check className="size-4.5 text-[#3B82F6]" strokeWidth={1.5} />
        </div>
        <h1 className="text-[24px] font-light tracking-[-0.5px] text-[#1D1D1F]">Match saved.</h1>
        <p className="max-w-[420px] text-center text-[12px] leading-[1.5] text-[#525252]">
          It&apos;s on your dashboard now. Analysis results are added to it as soon as
          they&apos;re ready.
        </p>
        <div className="mt-2 flex gap-2">
          <Button onClick={onUploadAnother} className={ghostBtnCls}>
            Upload another
          </Button>
          <Button asChild className={primaryBtnCls}>
            <Link href={EXIT_HREF}>Back to matches</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function UploadMatchWizard({ onCreated }: { onCreated: (matchId: string) => void }) {
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
    acceptString,
    requirementChips,
    onVideoPick,
    handleTrimChange,
    handleRemoveVideo,
  } = useUploadMatchModal({
    open: true,
    onOpenChange: handleOpenChange,
    onCreated: handleCreated,
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
      : isProcessingProvider && formData.initialTopPlayerIsPlayer1 === undefined
      ? "Pick which end you started on"
      : isProcessingProvider && formData.fixedCamera === undefined
      ? "Tell us about the camera"
      : null,
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
      const cta = document.querySelector<HTMLElement>('[data-modal-continue]:not([disabled])');
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
        <div className="max-w-[340px]">
          <StepIndicator currentStep={currentStepIndex} totalSteps={stepOrder.length} />
        </div>

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
          reachable without scrolling to the end of a long form. */}
      <div className="sticky bottom-0 mt-auto border-t border-[#F3F3F3] bg-[#FAFAFA]">
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
              data-modal-continue
              className={primaryBtnCls}
            >
              {isCreating ? "Creating…" : CONTINUE_LABEL[step]}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
