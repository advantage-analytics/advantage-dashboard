"use client";

/**
 * Upload Match Modal - Main Component
 * Shell that handles step indicator, title/subtitle, content, and footer buttons
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
import { ChevronLeft, ChevronDown } from "lucide-react";
import {
  Step,
  UploadMatchModalProps,
  STEP_CONFIG,
  STEP_ORDER,
  STEP_FOOTER_CONFIG,
} from "./types";
import { useUploadMatchModal } from "./useUploadMatchModal";
import { StepIndicator } from "./StepIndicator";
import { MethodContent } from "./MethodContent";
import { ProviderContent } from "./ProviderContent";
import { UploadContent } from "./UploadContent";
import { DetailsContent } from "./DetailsContent";
import { ConfirmContent } from "./ConfirmContent";

const HINT_STEPS = new Set<Step>(["details", "confirm"]);

const BTN_TEXT = "text-[10px] font-medium uppercase tracking-[1.5px]";
const BTN_GHOST = `rounded-full ${BTN_TEXT} bg-white border border-[#EAECF0] text-[#525252] hover:bg-[#F5F5F5] shadow-none`;
const BTN_PRIMARY = `rounded-full ${BTN_TEXT} bg-[#3B82F6] text-white hover:bg-[#2563EB]`;
const BTN_DISABLED = `rounded-full ${BTN_TEXT} bg-[#F3F3F3] text-[#AAAAAA]`;

export function UploadMatchModal({
  open,
  onOpenChange,
}: UploadMatchModalProps) {
  const {
    step,
    selectedMethod,
    selectedProvider,
    sourceType,
    uploadedFile,
    isOver,
    isCreating,
    isUploading,
    error,
    uploadError,
    isPrivateMatch,
    formData,
    parsingState,
    handleMethodSelect,
    handleMethodContinue,
    handleProviderSelect,
    handleProviderContinue,
    handleUploadContinue,
    handleDetailsContinue,
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
    const hasOverflow = el.scrollHeight > el.clientHeight;
    setShowScrollHint(isHintStep && hasOverflow);

    const onScroll = () => {
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 32;
      setShowScrollHint(isHintStep && !nearBottom);

      el.classList.add("upload-modal-scrolling");
      clearTimeout(scrollingTimeoutRef.current);
      scrollingTimeoutRef.current = setTimeout(() => {
        el.classList.remove("upload-modal-scrolling");
      }, 600);
    };
    el.addEventListener("scroll", onScroll);
    return () => {
      el.removeEventListener("scroll", onScroll);
      clearTimeout(scrollingTimeoutRef.current);
    };
  }, [step]);

  const currentStepIndex = STEP_ORDER.indexOf(step);
  const { title, description } = STEP_CONFIG[step];
  const { continueLabel } = STEP_FOOTER_CONFIG[step];

  let continueHandler: () => void = () => {};
  switch (step) {
    case "method":   continueHandler = handleMethodContinue; break;
    case "provider": continueHandler = handleProviderContinue; break;
    case "upload":   continueHandler = handleUploadContinue; break;
    case "details":  continueHandler = handleDetailsContinue; break;
    case "confirm":  continueHandler = handleCreateMatch; break;
  }

  const continueDisabled =
    (step === "method" && !selectedMethod) ||
    (step === "provider" && !selectedProvider) ||
    (step === "upload" && (!uploadedFile || isUploading)) ||
    (step === "confirm" && isCreating);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        hideCloseButton
        className="min-w-180 h-120 overflow-y-auto px-12 py-6 rounded-2xl flex-1 flex items-center justify-center"
      >
        <div className="flex flex-col justify-between h-full w-full">
          <div className="flex flex-col space-y-4">
            {/* Step Indicator */}
            <StepIndicator
              currentStep={currentStepIndex}
              totalSteps={STEP_ORDER.length}
            />

            {/* Header */}
            <div className="relative">
              {step !== "method" && (
                <button
                  onClick={handleBack}
                  className="group absolute left-0 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-[#F5F5F5] flex items-center justify-center hover:bg-[#3B82F6] transition-colors z-10"
                >
                  <ChevronLeft className="h-3 w-3 text-[#525252] group-hover:text-white" />
                </button>
              )}
              <DialogHeader className="space-y-2">
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription className="text-[12px] text-[#525252]">{description}</DialogDescription>
              </DialogHeader>
            </div>
          </div>

          {/* Content - scrollbar on left, minimal style */}
          <div className="relative w-full flex-1 min-h-0">
            <div ref={scrollRef} className="h-full overflow-y-auto py-6 -mr-4 pr-4 upload-modal-scroll">
            <div className="min-h-0 h-full">
            {step === "method" && (
              <MethodContent
                selectedMethod={selectedMethod}
                onMethodSelect={handleMethodSelect}
              />
            )}

            {step === "provider" && (
              <ProviderContent
                selectedProvider={selectedProvider}
                onProviderSelect={handleProviderSelect}
              />
            )}

            {step === "upload" && (
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
            )}

            {step === "details" && (
              <DetailsContent
                formData={formData}
                onInputChange={handleInputChange}
                onScoreChange={handleScoreChange}
                onTiebreakChange={handleTiebreakChange}
                parsingState={parsingState}
              />
            )}

            {step === "confirm" && (
              <ConfirmContent
                formData={formData}
                uploadedFile={uploadedFile}
                isPrivateMatch={isPrivateMatch}
                error={error}
              />
            )}
            </div>
            </div>
            {showScrollHint && (
              <div className="absolute bottom-0 left-0 right-4 flex justify-center pb-1">
                <button
                  onClick={() => scrollRef.current?.scrollBy({ top: scrollRef.current.clientHeight, behavior: "smooth" })}
                  className="flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-full px-2.5 py-1 border border-[#F3F3F3] cursor-pointer"
                >
                  <ChevronDown className="h-3 w-3 text-[#AAAAAA]" />
                  <span className="text-[10px] text-[#AAAAAA] font-medium tracking-wide">scroll</span>
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-center items-center gap-2 pt-4">
            {step === "confirm" ? (
              <>
                <Button
                  onClick={handleClose}
                  className={`w-[65px] h-[31px] ${BTN_GHOST}`}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleBack}
                  className={`w-[55px] h-[31px] ${BTN_PRIMARY}`}
                >
                  Edit
                </Button>
                <Button
                  onClick={handleCreateMatch}
                  disabled={isCreating}
                  className={`w-[110px] h-[31px] ${isCreating ? BTN_DISABLED : BTN_PRIMARY}`}
                >
                  {isCreating ? "Creating..." : "Create Match"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={handleClose}
                  className={`w-[65px] h-[31px] ${BTN_GHOST}`}
                >
                  Cancel
                </Button>
                <Button
                  onClick={continueHandler}
                  disabled={continueDisabled}
                  className={`w-[85px] h-[31px] ${continueDisabled ? BTN_DISABLED : BTN_PRIMARY}`}
                >
                  {continueLabel}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
