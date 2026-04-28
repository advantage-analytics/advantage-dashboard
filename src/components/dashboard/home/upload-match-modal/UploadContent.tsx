"use client";

/**
 * UploadContent - Step 3 content
 * File upload zone with drag-and-drop support
 *
 * Enforces single file upload per match.
 * Accepts provider-specific file types based on selected provider.
 */

import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Loader2,
  Check,
  Upload,
  Trash2,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
  X,
} from "lucide-react";
import { UploadedFile, ParsingState } from "./types";
import { ProviderId } from "@/lib/services/upload";

/** File type configuration per provider */
const PROVIDER_FILE_CONFIG: Record<
  ProviderId,
  { accept: string; description: string }
> = {
  "swing-vision": {
    accept: ".xlsx",
    description: "SwingVision export (.xlsx)",
  },
  "atp-tour": {
    accept: ".csv",
    description: "ATP Tour data (.csv)",
  },
};

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export interface UploadContentProps {
  sourceType: string;
  selectedProvider: ProviderId | null;
  uploadedFile: UploadedFile | null;
  isOver: boolean;
  isUploading?: boolean;
  uploadError?: string | null;
  parsingState?: ParsingState;
  onSourceTypeChange: (type: string) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: React.DragEventHandler<HTMLDivElement>;
  onFileChange: React.ChangeEventHandler<HTMLInputElement>;
  onRemoveFile: () => void;
}

export function UploadContent({
  selectedProvider,
  uploadedFile,
  isOver,
  isUploading = false,
  uploadError,
  parsingState,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileChange,
  onRemoveFile,
}: UploadContentProps) {
  const fileConfig = selectedProvider
    ? PROVIDER_FILE_CONFIG[selectedProvider]
    : { accept: ".csv,.xlsx", description: "Select a provider first" };

  const hasFile = !!uploadedFile;
  const FileIcon = selectedProvider === "atp-tour" ? FileText : FileSpreadsheet;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: EASE }}
      className="flex flex-col h-full gap-3"
    >
      <AnimatePresence>
        {uploadError && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="rounded-xl border border-[#E51837]/20 bg-[#E51837]/[0.04] p-3 flex items-start gap-2.5"
          >
            <AlertCircle className="h-4 w-4 text-[#E51837] mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[#0D0D0D] text-sm font-medium">Upload error</p>
              <p className="text-[#666] text-sm mt-0.5">{uploadError}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col flex-1 gap-3 min-h-0">
        {!hasFile ? (
          <motion.div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            initial={false}
            animate={{
              borderColor: isOver ? "#3B82F6" : "#EAECF0",
              backgroundColor: isOver
                ? "rgba(59, 130, 246, 0.03)"
                : "#FFFFFF",
            }}
            transition={{ duration: 0.2, ease: EASE }}
            className="relative flex-1 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-10"
          >
            <div className="relative z-10 flex flex-col items-center justify-center gap-4 text-center">
              {isUploading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-[#3B82F6]/10 text-[#3B82F6] flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                  <p className="text-base font-medium text-[#0D0D0D]">
                    Validating file...
                  </p>
                </div>
              ) : (
                <>
                  <motion.div
                    initial={false}
                    animate={{
                      backgroundColor: isOver
                        ? "#3B82F6"
                        : "rgba(59, 130, 246, 0.1)",
                      color: isOver ? "#FFFFFF" : "#3B82F6",
                    }}
                    transition={{ duration: 0.2, ease: EASE }}
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  >
                    <Upload className="h-6 w-6" />
                  </motion.div>

                  <div className="space-y-1">
                    <p className="text-base font-medium text-[#0D0D0D]">
                      Drag your file here
                    </p>
                    <p className="text-sm text-[#666]">
                      or click the button below to browse
                    </p>
                  </div>

                  <p className="text-xs text-[#888]">
                    {fileConfig.description} •{" "}
                    <span className="font-medium">Max 50MB</span>
                  </p>

                  <div className="pt-1">
                    <label htmlFor="upload-input-modal" className="block">
                      <Button
                        type="button"
                        className="bg-[#0D0D0D] hover:bg-[#1D1D1D] text-white text-sm font-medium rounded-[8px] h-9 px-4"
                        onClick={() =>
                          document.getElementById("upload-input-modal")?.click()
                        }
                      >
                        Browse files
                      </Button>
                    </label>
                  </div>

                  <input
                    id="upload-input-modal"
                    type="file"
                    onChange={onFileChange}
                    className="hidden"
                    accept={fileConfig.accept}
                    disabled={isUploading}
                  />
                </>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="space-y-3 flex flex-col"
          >
            <AnimatePresence>
              {parsingState?.parseWarnings &&
                parsingState.parseWarnings.length > 0 && (
                  <motion.div
                    key="warnings"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2, ease: EASE }}
                    className="rounded-xl border border-[#F59E0B]/20 bg-[#F59E0B]/[0.06] p-3 flex items-start gap-2.5"
                  >
                    <AlertTriangle className="h-4 w-4 text-[#B45309] mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[#0D0D0D] text-sm font-medium">
                        Parsing warnings
                      </p>
                      <ul className="text-[#666] text-sm mt-1 space-y-0.5">
                        {parsingState.parseWarnings.map((warning, idx) => (
                          <li key={idx}>• {warning}</li>
                        ))}
                      </ul>
                    </div>
                  </motion.div>
                )}

              {parsingState?.parseError && (
                <motion.div
                  key="parse-error"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: EASE }}
                  className="rounded-xl border border-[#E51837]/20 bg-[#E51837]/[0.04] p-3 flex items-start gap-2.5"
                >
                  <AlertCircle className="h-4 w-4 text-[#E51837] mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[#0D0D0D] text-sm font-medium">
                      Parsing error
                    </p>
                    <p className="text-[#666] text-sm mt-0.5">
                      {parsingState.parseError}
                    </p>
                    <p className="text-[#666] text-sm mt-1">
                      You can still enter data manually in the next step.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="rounded-xl border border-[#EAECF0] bg-white p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#3B82F6]/10 text-[#3B82F6] flex items-center justify-center flex-shrink-0">
                <FileIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#0D0D0D] truncate">
                  {uploadedFile.name}
                </p>
                <p className="text-xs text-[#888] mt-0.5">
                  {uploadedFile.size}
                </p>
              </div>

              <StatusBadge parsingState={parsingState} />

              <button
                type="button"
                onClick={onRemoveFile}
                disabled={isUploading}
                className="ml-1 p-2 text-[#888] hover:text-[#E51837] hover:bg-[#E51837]/[0.06] rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                aria-label="Remove file"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-[#888]">
              You can change this file at any time before creating the match.
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function StatusBadge({ parsingState }: { parsingState?: ParsingState }) {
  if (!parsingState) return null;

  if (parsingState.isParsing) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-[#3B82F6]/10 text-[#3B82F6]">
        <Loader2 className="h-3 w-3 animate-spin" />
        Parsing
      </span>
    );
  }

  if (parsingState.parseError) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-[#E51837]/10 text-[#E51837]">
        <X className="h-3 w-3" />
        Error
      </span>
    );
  }

  if (parsingState.parseWarnings && parsingState.parseWarnings.length > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-[#F59E0B]/[0.12] text-[#B45309]">
        <AlertTriangle className="h-3 w-3" />
        Warning
      </span>
    );
  }

  if (parsingState.parseSuccess) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-[#5DB955]/[0.12] text-[#3F8E3A]">
        <Check className="h-3 w-3" />
        Ready
      </span>
    );
  }

  return null;
}
