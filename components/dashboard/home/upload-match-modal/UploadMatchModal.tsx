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
    selectedProvider,
    sourceType,
    uploadedFile,
    isOver,
    isCreating,
    error,
    isPrivateMatch,
    formData,
    handleMethodSelect,
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
  const { showBack, continueLabel } = STEP_FOOTER_CONFIG[step];

  // Get the continue handler for the current step
  const getContinueHandler = () => {
    switch (step) {
      case "method":
        return handleMethodSelect;
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
    if (step === "provider" && !selectedProvider) return true;
    if (step === "confirm" && isCreating) return true;
    return false;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-180 h-120 overflow-y-auto">
        {/* Step Indicator */}
        <StepIndicator
          currentStep={currentStepIndex}
          totalSteps={STEP_ORDER.length}
        />

        {/* Header */}
        <DialogHeader className="gap-2">
          <DialogTitle className="text-center text-2xl font-medium">
            {title}
          </DialogTitle>
          <DialogDescription className="text-center text-sm font-normal text-[#999999]">
            {description}
          </DialogDescription>
        </DialogHeader>

        {/* Content */}
        <div className="mt-6">
          {step === "method" && (
            <MethodContent onMethodSelect={handleMethodSelect} />
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
        <div className="flex justify-center gap-4 mt-6">
          {showBack && (
            <Button variant="outline" onClick={handleBack} className="px-8">
              Back
            </Button>
          )}
          <Button
            onClick={getContinueHandler()}
            disabled={isContinueDisabled()}
            className="px-8 bg-gray-200 text-gray-600 hover:bg-gray-300"
          >
            {step === "confirm" && isCreating
              ? "Creating Match..."
              : continueLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
