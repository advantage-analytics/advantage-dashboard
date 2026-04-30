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
import { useRef, useState, useEffect } from "react";
import { ArrowLeft, ChevronDown, X, CheckCircle2 } from "lucide-react";
import {
  Step,
  UploadMatchModalProps,
  STEP_CONFIG,
  STEP_ORDER,
  STEP_FOOTER_CONFIG,
} from "./types";
import { useUploadMatchModal } from "./useUploadMatchModal";
import { StepIndicator } from "./StepIndicator";
import { ProviderContent } from "./ProviderContent";
import { UploadContent } from "./UploadContent";
import { DetailsContent } from "./DetailsContent";
import { ConfirmContent } from "./ConfirmContent";

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
    justCreated,
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
  } = useUploadMatchModal({ open, onOpenChange });

  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const scrollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
  const { continueLabel } = STEP_FOOTER_CONFIG[step];

  let continueHandler: () => void = () => {};
  switch (step) {
    case "provider": continueHandler = handleProviderContinue; break;
    case "match":    continueHandler = handleMatchContinue; break;
    case "confirm":  continueHandler = handleCreateMatch; break;
  }

  const continueDisabled =
    (step === "provider" && !selectedProvider) ||
    (step === "match" &&
      (!uploadedFile || isUploading || !formData.eventName.trim())) ||
    (step === "confirm" && isCreating);

  // Enter-to-continue. Ignores presses inside form controls so score-entry & dropdowns keep
  // their native semantics (Enter advances focus inside DetailsContent, opens selects, etc.).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
      if (justCreated) return;
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
  }, [open, continueDisabled, continueHandler, justCreated]);

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

  const primaryBtn =
    "h-9 px-4 rounded-[6px] text-[13px] font-medium bg-[#3B82F6] hover:bg-[#2563EB] text-white shadow-[0_1px_3px_rgba(57,134,243,0.25)] transition-colors duration-200 disabled:bg-[#F7F7F7] disabled:text-[#888888] disabled:shadow-none";
  const ghostBtn =
    "h-9 px-4 rounded-[6px] text-[13px] font-medium bg-white border border-[#EAECF0] text-[#525252] hover:bg-[#F5F5F5] shadow-none transition-colors duration-200";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        hideCloseButton
        className="flex flex-col gap-0 min-w-[760px] h-[600px] max-h-[85vh] overflow-hidden p-0 rounded-2xl border border-[#F3F3F3] shadow-[0px_6px_20px_0px_rgba(0,0,0,0.12)]"
      >
        <div className="relative flex flex-col h-full w-full bg-white">
          {/* Success overlay — peak-end moment */}
          {justCreated && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white animate-fadeIn">
              <div className="size-12 rounded-full bg-[rgba(93,185,85,0.06)] border border-[rgba(93,185,85,0.18)] flex items-center justify-center animate-success-pop">
                <CheckCircle2 className="size-6 text-[#5DB955]" strokeWidth={1.5} />
              </div>
              <p className="mt-4 text-[16px] font-normal tracking-[-0.4px] text-[#0D0D0D] animate-success-rise">
                Match created
              </p>
              <p className="mt-1 text-[12px] text-[#888888] animate-success-rise [animation-delay:60ms]">
                Processing in the background…
              </p>
            </div>
          )}

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
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsOver(true);
                      }}
                      onDragLeave={() => setIsOver(false)}
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
                      />
                    )}
                  </div>
                )}

                {step === "confirm" && (
                  <ConfirmContent
                    formData={formData}
                    uploadedFile={uploadedFile}
                    error={error}
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
                  <kbd
                    aria-hidden="true"
                    aria-label="Enter"
                    className="inline-block px-1 py-0.5 rounded text-[10px] font-medium leading-none text-[#AAAAAA] bg-[#F0F0F0]"
                  >
                    ↵
                  </kbd>
                  <span>{step === "confirm" ? "to create" : "to continue"}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {step === "confirm" ? (
                <>
                  <Button onClick={handleBack} className={ghostBtn}>
                    Edit
                  </Button>
                  <Button
                    onClick={handleCreateMatch}
                    disabled={isCreating}
                    className={primaryBtn}
                  >
                    {isCreating ? "Creating…" : "Create match"}
                  </Button>
                </>
              ) : (
                <Button
                  onClick={continueHandler}
                  disabled={continueDisabled}
                  className={primaryBtn}
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
