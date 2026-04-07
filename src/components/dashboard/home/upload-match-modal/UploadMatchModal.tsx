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
import { motion, AnimatePresence } from "framer-motion";
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
const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;
const STEP_TRANSITION = { duration: 0.25, ease: EASE_CURVE } as const;

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
                  aria-label="Go back"
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg flex items-center justify-center text-[#888888] hover:text-[#0D0D0D] hover:bg-[#F5F5F5] transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:outline-none z-10"
                >
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
                </button>
              )}
              <DialogHeader className="space-y-2">
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
              </DialogHeader>
            </div>
          </div>

          {/* Content - scrollbar on left, minimal style */}
          <div className="relative w-full flex-1 min-h-0">
            <div ref={scrollRef} className="h-full overflow-y-auto py-6 -mr-4 pr-4 upload-modal-scroll">
            <div className="min-h-0 h-full">
            <AnimatePresence mode="wait">
              {step === "method" && (
                <motion.div
                  key="method"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={STEP_TRANSITION}
                >
                  <MethodContent
                    selectedMethod={selectedMethod}
                    onMethodSelect={handleMethodSelect}
                  />
                </motion.div>
              )}

              {step === "provider" && (
                <motion.div
                  key="provider"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={STEP_TRANSITION}
                >
                  <ProviderContent
                    selectedProvider={selectedProvider}
                    onProviderSelect={handleProviderSelect}
                  />
                </motion.div>
              )}

              {step === "upload" && (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={STEP_TRANSITION}
                >
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
                </motion.div>
              )}

              {step === "details" && (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={STEP_TRANSITION}
                >
                  <DetailsContent
                    formData={formData}
                    onInputChange={handleInputChange}
                    onScoreChange={handleScoreChange}
                    onTiebreakChange={handleTiebreakChange}
                    parsingState={parsingState}
                  />
                </motion.div>
              )}

              {step === "confirm" && (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={STEP_TRANSITION}
                >
                  <ConfirmContent
                    formData={formData}
                    uploadedFile={uploadedFile}
                    isPrivateMatch={isPrivateMatch}
                    error={error}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            </div>
            </div>
            {showScrollHint && (
              <div className="absolute bottom-0 left-0 right-4 flex justify-center pb-1">
                <button
                  onClick={() => scrollRef.current?.scrollBy({ top: scrollRef.current.clientHeight, behavior: "smooth" })}
                  aria-label="Scroll down for more content"
                  className="flex items-center gap-1 bg-white border border-[#F3F3F3] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] rounded-full px-2.5 py-1 cursor-pointer"
                >
                  <ChevronDown className="h-3 w-3 text-[#888888]" />
                  <span className="text-[9px] text-[#888888] font-normal tracking-wide">scroll</span>
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
                  className="min-h-[34px] rounded-full px-4 py-1.5 text-[10px] font-medium uppercase tracking-[1.5px] border border-[#EAECF0] text-[#525252] bg-white hover:bg-[#F5F5F5] transition-colors duration-200 shadow-none"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleBack}
                  className="min-h-[34px] rounded-full px-4 py-1.5 text-[10px] font-medium uppercase tracking-[1.5px] bg-[#3B82F6] text-white hover:bg-[#2563EB] transition-colors duration-200 shadow-none"
                >
                  Edit
                </Button>
                <Button
                  onClick={handleCreateMatch}
                  disabled={isCreating}
                  className={`min-h-[34px] rounded-full px-4 py-1.5 text-[10px] font-medium uppercase tracking-[1.5px] transition-colors duration-200 shadow-none ${
                    isCreating
                      ? "bg-[#F7F7F7] text-[#888888]"
                      : "bg-[#0D0D0D] text-white hover:bg-[#1D1D1F]"
                  }`}
                >
                  {isCreating ? "Creating..." : "Create Match"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={handleClose}
                  className="min-h-[34px] rounded-full px-4 py-1.5 text-[10px] font-medium uppercase tracking-[1.5px] border border-[#EAECF0] text-[#525252] bg-white hover:bg-[#F5F5F5] transition-colors duration-200 shadow-none"
                >
                  Cancel
                </Button>
                <Button
                  onClick={continueHandler}
                  disabled={continueDisabled}
                  className={`min-h-[34px] rounded-full px-4 py-1.5 text-[10px] font-medium uppercase tracking-[1.5px] transition-colors duration-200 shadow-none ${
                    continueDisabled
                      ? "bg-[#F7F7F7] text-[#888888]"
                      : "bg-[#0D0D0D] text-white hover:bg-[#1D1D1F]"
                  }`}
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
