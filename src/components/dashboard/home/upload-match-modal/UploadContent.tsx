"use client";

/**
 * UploadContent - Step 3 content
 * File upload zone with drag-and-drop support
 *
 * Enforces single file upload per match.
 * Accepts provider-specific file types based on selected provider.
 * Features sophisticated animations and state management matching modal design language.
 */

import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  Loader2,
  CheckCircle2,
  Upload,
  Trash2,
  FileSpreadsheet,
  AlertTriangle,
} from "lucide-react";
import { UploadedFile, ParsingState } from "./types";
import { ProviderId } from "@/lib/services/upload";
import { motion } from "framer-motion";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

const FADE_IN = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.3, ease: EASE_CURVE },
} as const;

const SLIDE_DOWN = {
  initial: { opacity: 0, y: -8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: EASE_CURVE },
} as const;

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

  return (
    <motion.div
      className="flex flex-col h-full gap-3"
      {...FADE_IN}
    >
      {/* Error State - Compact and at top */}
      {uploadError && (
        <motion.div {...SLIDE_DOWN}>
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-red-600 text-xs font-medium">Upload Error</p>
              <p className="text-red-600 text-xs mt-0.5">{uploadError}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Main Content Area - Grows to fill space */}
      <div className="flex flex-col flex-1 gap-3 min-h-0">
        {!hasFile ? (
          <>
            {/* Drag and Drop Zone - Centered and spacious */}
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`flex-1 border-2 border-dashed rounded-2xl transition-colors duration-200 group flex flex-col items-center justify-center ${
                isUploading
                  ? "border-[#E5E5EA] bg-[#FAFAFA]"
                  : isOver
                    ? "border-[#3B82F6] bg-[#EBF2FD]"
                    : "border-[#E5E5EA] hover:border-[#3B82F6] hover:bg-[#EFF4FF]"
              }`}
            >
              {/* Content - Properly centered */}
              <div className="flex flex-col items-center justify-center gap-4 px-6 py-6">
                {isUploading ? (
                  <>
                    {/* Loading State */}
                    <motion.div
                      className="flex flex-col items-center gap-3"
                      {...FADE_IN}
                    >
                      <div className="relative w-14 h-14 flex items-center justify-center">
                        <Loader2 className="h-7 w-7 text-[#3B82F6] animate-spin" />
                      </div>
                      <p className="text-[#0D0D0D] font-medium text-sm">
                        Validating file...
                      </p>
                    </motion.div>
                  </>
                ) : (
                  <>
                    {/* Upload Prompt */}
                    <div className="flex flex-col items-center gap-3 text-center">
                      {/* Icon */}
                      <div
                        className={`w-16 h-16 flex items-center justify-center rounded-2xl transition-colors duration-200 ${
                          isOver
                            ? "bg-[#3B82F6]"
                            : "bg-[#F5F5F5] group-hover:bg-[#3B82F6]"
                        }`}
                      >
                        <Upload
                          className={`h-8 w-8 transition-colors duration-200 ${
                            isOver
                              ? "text-white"
                              : "text-[#3B82F6] group-hover:text-white"
                          }`}
                        />
                      </div>

                      {/* Text Content */}
                      <div className="space-y-1.5">
                        <p className="text-[14px] font-normal text-[#0D0D0D]">
                          Drag your file here
                        </p>
                        <p className="text-[12px] font-normal text-[#888888]">
                          or click the button below to browse
                        </p>
                      </div>

                      {/* File Info */}
                      <p className="text-[11px] font-normal text-[#888888] pt-1">
                        {fileConfig.description} •{" "}
                        <span className="font-medium">Max 50MB</span>
                      </p>
                    </div>

                    {/* Browse Button */}
                    <div className="pt-2">
                      <label htmlFor="upload-input-modal" className="block">
                        <Button
                          type="button"
                          className="min-h-[34px] rounded-full px-5 py-1.5 text-[10px] font-medium uppercase tracking-[1.5px] bg-[#0D0D0D] text-white hover:bg-[#1D1D1F] transition-colors duration-200 shadow-none active:scale-[0.97]"
                          onClick={() =>
                            document.getElementById("upload-input-modal")?.click()
                          }
                        >
                          Browse Files
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
            </div>
          </>
        ) : (
          <>
            {/* File Uploaded State */}
            <motion.div
              className="space-y-3 flex flex-col"
              {...FADE_IN}
            >
              {/* Upload Progress & Status */}
              {parsingState && (
                <>
                  {parsingState.isParsing && (
                    <motion.div
                      {...SLIDE_DOWN}
                      className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg"
                    >
                      <Loader2 className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0" />
                      <p className="text-blue-600 text-xs font-medium">
                        Extracting match data...
                      </p>
                    </motion.div>
                  )}

                  {parsingState.parseSuccess && (
                    <motion.div
                      {...SLIDE_DOWN}
                      className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg"
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                      <p className="text-emerald-600 text-xs font-medium">
                        Match data extracted, ready to proceed!
                      </p>
                    </motion.div>
                  )}

                  {parsingState.parseWarnings.length > 0 && (
                    <motion.div
                      {...SLIDE_DOWN}
                      className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg"
                    >
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-amber-600 text-xs font-medium">
                          Parsing warnings
                        </p>
                        <ul className="text-amber-600 text-xs mt-1 space-y-0.5">
                          {parsingState.parseWarnings.map((warning, idx) => (
                            <li key={idx}>• {warning}</li>
                          ))}
                        </ul>
                      </div>
                    </motion.div>
                  )}

                  {parsingState.parseError && (
                    <motion.div
                      {...SLIDE_DOWN}
                      className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5"
                    >
                      <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-red-600 text-xs font-medium">
                          Parsing Error
                        </p>
                        <p className="text-red-600 text-xs mt-0.5">
                          {parsingState.parseError}
                        </p>
                        <p className="text-red-600 text-xs mt-1">
                          You can still enter data manually in the next step.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </>
              )}

              {/* File Card */}
              <div className="border border-[#F3F3F3] rounded-[14px] bg-white shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] overflow-hidden">
                {/* Card Header */}
                <div className="px-4 py-3 border-b border-[#F3F3F3] bg-[#FAFAFA] flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-[#3B82F6] rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileSpreadsheet className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[#0D0D0D] truncate">
                        {uploadedFile.name}
                      </p>
                      <p className="text-[12px] font-normal text-[#888888]">
                        {uploadedFile.size}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Card Footer - Action */}
                <div className="px-4 py-3 flex items-center justify-between bg-white">
                  <p className="text-[#888888] text-xs">
                    Ready to proceed to next step
                  </p>
                  <button
                    type="button"
                    onClick={onRemoveFile}
                    disabled={isUploading}
                    className="p-2 text-[#888888] hover:text-[#E51837] hover:bg-[rgba(229,24,55,0.15)] rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Remove file"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Info Text */}
              <p className="text-[#888888] text-xs pt-1">
                You can change this file at any time before creating the match.
              </p>
            </motion.div>
          </>
        )}
      </div>
    </motion.div>
  );
}
