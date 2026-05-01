"use client";

/**
 * Upload Match Modal — wizard shell.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRef, useState, useEffect, useCallback } from "react";
import { ArrowLeft, ChevronDown, X } from "lucide-react";
import {
  Step,
  UploadMatchModalProps,
  STEP_CONFIG,
  STEP_ORDER,
  CONTINUE_LABEL,
} from "./types";
import { useUploadMatchModal } from "./useUploadMatchModal";
import { StepIndicator } from "./StepIndicator";
import { ProviderContent } from "./ProviderContent";
import { UploadContent } from "./UploadContent";
import { DetailsContent } from "./DetailsContent";
import { ConfirmContent } from "./ConfirmContent";
import { primaryBtnCls, ghostBtnCls } from "./styles";

const HINT_STEPS = new Set<Step>(["match", "confirm"]);

export function UploadMatchModal({
  open,
  onOpenChange,
}: UploadMatchModalProps) {
  const {
    step,
    selectedProvider,
    sourceType,
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
    handleMatchContinue,
    handleBack,
    handleClose,
    setIsOver,
    setSourceType,
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
  } = useUploadMatchModal({ open, onOpenChange });

  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const scrollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsOver(true);
  }, [setIsOver]);
  const onDragLeave = useCallback(() => setIsOver(false), [setIsOver]);

  const continueHandler =
    step === "provider" ? handleProviderContinue
    : step === "match" ? handleMatchContinue
    : handleCreateMatch;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isHintStep = HINT_STEPS.has(step);

    const recompute = () => {
      const hasOverflow = el.scrollHeight > el.clientHeight + 1;
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 32;
      setShowScrollHint(isHintStep && hasOverflow && !nearBottom);
    };
    recompute();

    const onScroll = () => {
      recompute();
      el.classList.add("upload-modal-scrolling");
      clearTimeout(scrollingTimeoutRef.current);
      scrollingTimeoutRef.current = setTimeout(() => {
        el.classList.remove("upload-modal-scrolling");
      }, 600);
    };
    el.addEventListener("scroll", onScroll);

    // Watch for content height changes (Advanced expand/collapse, parsing banner)
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);

    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      clearTimeout(scrollingTimeoutRef.current);
    };
  }, [step]);

  const currentStepIndex = STEP_ORDER.indexOf(step);
  const { title, description } = STEP_CONFIG[step];
  const continueLabel = CONTINUE_LABEL[step];

  const continueDisabled =
    (step === "provider" && !selectedProvider) ||
    (step === "match" &&
      (!uploadedFile || isUploading || !formData.eventName.trim())) ||
    (step === "confirm" && isCreating);

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
    if (!open) return;
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
  }, [open]);

  // Keyboard:
  //   • Plain Enter advances the wizard when focus is outside form controls
  //     (so score-entry and dropdowns keep their native Enter semantics —
  //     focus chain in DetailsContent, opening selects, etc.).
  //   • ⌘/Ctrl+Enter advances *focus* to the next field — same idea as Tab,
  //     but reachable without the user having to retrain pinkies. Submitting
  //     the wizard is reserved for the explicit Continue button so a fast-typed
  //     chord can never skip a missed field.
  //   • Esc steps back when there's a previous step (handled here, not via the
  //     dialog's default close, so Esc doesn't dump the user out of the wizard).
  useEffect(() => {
    if (!open) return;

    const focusNextField = () => {
      // Walk forward through the scrollable content's tabbables. When the
      // user runs out of fields, fall through to the Continue button so the
      // terminal chord lands on submit instead of silently no-op'ing.
      const root = scrollRef.current;
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
        if (inFieldNext instanceof HTMLInputElement && /text|number|search|email|url/i.test(inFieldNext.type || "text")) {
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
  }, [open, continueDisabled, continueHandler, step, handleBack]);

  // Disabled-state hints. Only consumed when continueDisabled is true.
  const footerHint =
    step === "match" && !uploadedFile
      ? "Drop or browse a file"
      : step === "match" && isUploading
      ? "Validating file…"
      : step === "match" && !formData.eventName.trim()
      ? "Add a match name"
      : step === "confirm" && isCreating
      ? "Creating match…"
      : "Make a selection";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        hideCloseButton
        className="flex flex-col gap-0 min-w-[760px] h-[600px] max-h-[85vh] overflow-hidden p-0 rounded-2xl border border-[#F3F3F3] shadow-[0px_6px_20px_0px_rgba(0,0,0,0.12)]"
      >
        <div className="relative flex flex-col h-full w-full bg-white">
          {/* Top bar — matched ghost circles for back + close */}
          <div className="flex items-center justify-between px-8 pt-5">
            {step !== "provider" ? (
              <button
                onClick={handleBack}
                aria-label="Back"
                className="h-7 w-7 rounded-lg flex items-center justify-center text-[#888888] hover:text-[#0D0D0D] hover:bg-[#F5F5F5] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
              >
                <ArrowLeft className="size-3.5" strokeWidth={1.5} />
              </button>
            ) : (
              <span className="h-7 w-7" aria-hidden="true" />
            )}
            <button
              onClick={handleClose}
              aria-label="Close"
              className="h-7 w-7 rounded-lg flex items-center justify-center text-[#888888] hover:text-[#0D0D0D] hover:bg-[#F5F5F5] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
            >
              <X className="size-3.5" strokeWidth={1.5} />
            </button>
          </div>

          {/* Header zone — three-tier rhythm: bars · 24px · title · 6px · desc */}
          <div className="px-8 pt-5 pb-6">
            <StepIndicator
              currentStep={currentStepIndex}
              totalSteps={STEP_ORDER.length}
            />
            <DialogHeader className="mt-6 space-y-1.5 items-start text-left">
              <DialogTitle className="text-[24px] font-light text-[#1D1D1F] tracking-[-0.5px] leading-[30px]">
                {title}
              </DialogTitle>
              <DialogDescription className="text-[12px] font-normal text-[#525252] leading-[1.5] max-w-[440px]">
                {description}
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Content */}
          <div className="relative flex-1 min-h-0 px-8">
            <div
              ref={scrollRef}
              className="h-full overflow-y-auto py-6 -mx-4 px-4 upload-modal-scroll"
            >
              <div
                key={step}
                className="min-h-full animate-fadeIn"
              >
                {step === "provider" && (
                  <ProviderContent
                    selectedProvider={selectedProvider}
                    onProviderSelect={handleProviderSelect}
                  />
                )}

                {step === "match" && (
                  <div className="flex flex-col gap-6">
                    <UploadContent
                      sourceType={sourceType}
                      selectedProvider={selectedProvider}
                      uploadedFile={uploadedFile}
                      isOver={isOver}
                      isUploading={isUploading}
                      uploadError={uploadError}
                      parsingState={parsingState}
                      onSourceTypeChange={setSourceType}
                      onDragOver={onDragOver}
                      onDragLeave={onDragLeave}
                      onDrop={handleDrop}
                      onFileChange={handleFileChange}
                      onRemoveFile={handleRemoveFile}
                    />
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
                  />
                )}
              </div>
            </div>
            {showScrollHint && (
              <div className="pointer-events-none absolute bottom-0 left-8 right-8 h-12 bg-gradient-to-t from-white to-transparent flex items-end justify-center pb-1">
                <button
                  onClick={() =>
                    scrollRef.current?.scrollBy({
                      top: scrollRef.current.clientHeight,
                      behavior: "smooth",
                    })
                  }
                  className="pointer-events-auto flex items-center gap-1 bg-white rounded-full px-2.5 py-1 border border-[#F3F3F3] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] hover:border-[#3B82F6]/30 transition-colors duration-200"
                >
                  <ChevronDown className="size-3 text-[#888888]" strokeWidth={1.5} />
                  <span className="text-[10px] text-[#888888] font-medium uppercase tracking-[1.5px]">
                    scroll
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[#F3F3F3] px-8 py-3.5 flex items-center justify-between bg-[#FAFAFA]">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
              {continueDisabled ? (
                <span>{footerHint}</span>
              ) : (
                <>
                  <span>Press</span>
                  {/* When focus is mid-form, plain Enter is suppressed so we surface
                      the chord users can still rely on. Platform-detected per
                      SKILL.md › Keyboard Shortcut Chip conventions: ⌘ on Mac
                      concatenates without `+`, Ctrl+ elsewhere. Render is gated
                      until isMac resolves to avoid SSR mismatches. */}
                  {focusInForm && isMac !== null ? (
                    <kbd
                      aria-hidden="true"
                      aria-label={isMac ? "Command Enter" : "Control Enter"}
                      className="inline-block px-1 py-0.5 rounded text-[10px] font-medium leading-none text-[#AAAAAA] bg-[#F0F0F0]"
                    >
                      {isMac ? "⌘↵" : "Ctrl+↵"}
                    </kbd>
                  ) : (
                    <kbd
                      aria-hidden="true"
                      aria-label="Enter"
                      className="inline-block px-1 py-0.5 rounded text-[10px] font-medium leading-none text-[#AAAAAA] bg-[#F0F0F0]"
                    >
                      ↵
                    </kbd>
                  )}
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
              {step === "confirm" ? (
                <>
                  <Button onClick={handleBack} className={ghostBtnCls}>
                    Edit
                  </Button>
                  <Button
                    onClick={handleCreateMatch}
                    disabled={isCreating}
                    data-modal-continue
                    className={primaryBtnCls}
                  >
                    {isCreating ? "Creating…" : "Create match"}
                  </Button>
                </>
              ) : (
                <Button
                  onClick={continueHandler}
                  disabled={continueDisabled}
                  data-modal-continue
                  className={primaryBtnCls}
                >
                  {continueLabel}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
