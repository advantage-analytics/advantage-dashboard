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
import { ChevronLeft } from "lucide-react";
import {
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
    error,
    isPrivateMatch,
    formData,
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
    handleCreateMatch,
  } = useUploadMatchModal({ open, onOpenChange });

  const currentStepIndex = STEP_ORDER.indexOf(step);
  const { title, description } = STEP_CONFIG[step];
  const { continueLabel } = STEP_FOOTER_CONFIG[step];

  // Get the continue handler for the current step
  const getContinueHandler = () => {
    switch (step) {
      case "method":
        return handleMethodContinue;
      case "provider":
        return handleProviderContinue;
      case "upload":
        return handleUploadContinue;
      case "details":
        return handleDetailsContinue;
      case "confirm":
        return handleCreateMatch;
      default:
        return () => {};
    }
  };

  // Check if continue should be disabled
  const isContinueDisabled = () => {
    if (step === "method" && !selectedMethod) return true;
    if (step === "provider" && !selectedProvider) return true;
    if (step === "confirm" && isCreating) return true;
    return false;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        hideCloseButton
        className="max-w-180 h-120 overflow-y-auto p-6 rounded-2xl flex-1 flex items-center justify-center"
      >
        <div className="flex flex-col justify-between h-full">
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
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-[#1D1D1F] flex items-center justify-center hover:bg-[#2D2D2D] transition-colors z-10"
                >
                  <ChevronLeft className="h-3 w-3 text-white" />
                </button>
              )}
              <DialogHeader className="space-y-2">
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
              </DialogHeader>
            </div>
          </div>

          {/* Content */}
          <div>
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
                uploadedFile={uploadedFile}
                isOver={isOver}
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

          {/* Footer */}
          <div className="flex justify-center gap-4">
            <Button
              onClick={getContinueHandler()}
              disabled={isContinueDisabled()}
              className={`w-[85px] h-[27px] rounded-full text-sm ${
                isContinueDisabled()
                  ? "bg-[#F7F7F7] text-[#999999]"
                  : "bg-[#0D0D0D] text-white"
              }`}
            >
              {step === "confirm" && isCreating
                ? "Creating Match..."
                : continueLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
