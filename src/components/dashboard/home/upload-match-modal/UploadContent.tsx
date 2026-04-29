"use client";

/**
 * UploadContent — Step 3
 * Drag-and-drop file zone with parse-state feedback.
 */

import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  Loader2,
  CheckCircle2,
  Trash2,
  FileSpreadsheet,
  AlertTriangle,
} from "lucide-react";
import { UploadedFile, ParsingState } from "./types";
import { ProviderId } from "@/lib/services/upload";

const PROVIDER_FILE_CONFIG: Record<
  ProviderId,
  { accept: string; ext: string; description: string }
> = {
  "swing-vision": {
    accept: ".xlsx",
    ext: "XLSX",
    description: "SwingVision export",
  },
  "atp-tour": {
    accept: ".csv",
    ext: "CSV",
    description: "ATP Tour data",
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
    : { accept: ".csv,.xlsx", ext: "FILE", description: "Select a provider first" };

  const hasFile = !!uploadedFile;
  const triggerBrowse = () =>
    document.getElementById("upload-input-modal")?.click();

  const parseStatus: "parsing" | "success" | "error" | "warning" | "idle" =
    parsingState?.isParsing
      ? "parsing"
      : parsingState?.parseError
      ? "error"
      : parsingState?.parseSuccess
      ? parsingState.parseWarnings.length > 0
        ? "warning"
        : "success"
      : "idle";

  return (
    <div className="flex flex-col h-full gap-3">
      {uploadError && (
        <div className="animate-slideDown p-3 bg-[rgba(229,24,55,0.06)] border border-[rgba(229,24,55,0.15)] rounded-[10px] flex items-start gap-2.5">
          <AlertCircle className="size-3.5 text-[#E51837] mt-0.5 flex-shrink-0" strokeWidth={1.5} />
          <div>
            <p className="text-[#E51837] text-[12px] font-medium">Upload error</p>
            <p className="text-[#E51837] text-[12px] mt-0.5">{uploadError}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col flex-1 gap-3 min-h-0">
        {!hasFile ? (
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`relative flex-1 rounded-[14px] border border-dashed transition-colors duration-200 flex flex-col items-center justify-center overflow-hidden ${
              isUploading
                ? "bg-[#FAFAFA] border-[#F3F3F3]"
                : isOver
                ? "bg-[#EFF4FF] border-[#3B82F6]"
                : "bg-[#FAFAFA] border-[#F3F3F3] hover:bg-[#FAFBFF] hover:border-[#3B82F6]/40"
            }`}
          >
            {/* Subtle dotted texture */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.35]"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, #E5E5EA 1px, transparent 0)",
                backgroundSize: "20px 20px",
              }}
            />

            <div className="relative z-10 flex flex-col items-center gap-5 px-6 py-8 text-center">
              {isUploading ? (
                <>
                  <div className="size-14 flex items-center justify-center rounded-full bg-white border border-[#F3F3F3] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)]">
                    <Loader2 className="size-5 text-[#3B82F6] animate-spin" strokeWidth={1.5} />
                  </div>
                  <p className="text-[#0D0D0D] text-[13px] font-normal">
                    Validating file…
                  </p>
                </>
              ) : (
                <>
                  {/* Layered file visual — three stacked rectangles, blue file on top */}
                  <div className="relative h-[68px] w-[80px]">
                    {/* Back tile */}
                    <div
                      className={`absolute left-1/2 top-2 -translate-x-1/2 size-12 rounded-[10px] bg-white border border-[#F3F3F3] shadow-[0px_1px_3px_rgba(0,0,0,0.04)] transition-transform duration-300 ${
                        isOver ? "-translate-x-[calc(50%+14px)] -rotate-[10deg]" : "-translate-x-[calc(50%+8px)] -rotate-[6deg]"
                      }`}
                    />
                    {/* Middle tile */}
                    <div
                      className={`absolute left-1/2 top-2 -translate-x-1/2 size-12 rounded-[10px] bg-white border border-[#F3F3F3] shadow-[0px_1px_3px_rgba(0,0,0,0.04)] transition-transform duration-300 ${
                        isOver ? "translate-x-[calc(-50%+14px)] rotate-[10deg]" : "translate-x-[calc(-50%+8px)] rotate-[6deg]"
                      }`}
                    />
                    {/* Front file tile */}
                    <div
                      className={`absolute left-1/2 top-1 -translate-x-1/2 size-12 rounded-[10px] flex items-center justify-center shadow-[0px_2px_8px_rgba(0,0,0,0.08)] transition-all duration-300 ${
                        isOver
                          ? "bg-[#3B82F6] -translate-y-1 scale-[1.06]"
                          : "bg-[#3B82F6]"
                      }`}
                    >
                      <FileSpreadsheet className="size-5 text-white" strokeWidth={1.5} />
                    </div>
                  </div>

                  <div className="space-y-1.5 max-w-[360px]">
                    <p className="text-[#0D0D0D] text-[14px] font-normal tracking-[-0.4px]">
                      {isOver ? "Drop it here" : "Drag & drop your match file"}
                    </p>
                    <p className="text-[#888888] text-[12px] font-normal leading-[1.5]">
                      or browse from your computer
                    </p>
                  </div>

                  <label htmlFor="upload-input-modal">
                    <Button
                      type="button"
                      className="h-9 px-4 rounded-[6px] bg-[#3B82F6] hover:bg-[#2563EB] text-white text-[13px] font-medium shadow-[0_1px_3px_rgba(57,134,243,0.25)] transition-colors duration-200"
                      onClick={triggerBrowse}
                    >
                      Browse files
                    </Button>
                  </label>
                  <input
                    id="upload-input-modal"
                    type="file"
                    onChange={onFileChange}
                    className="hidden"
                    accept={fileConfig.accept}
                    disabled={isUploading}
                  />

                  {/* Format chips */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <span className="inline-flex items-center rounded-[6px] bg-white border border-[#F3F3F3] px-2 py-1 text-[10px] font-medium text-[#525252] tracking-[0.5px]">
                      {fileConfig.ext}
                    </span>
                    <span className="inline-flex items-center rounded-[6px] bg-white border border-[#F3F3F3] px-2 py-1 text-[10px] font-medium text-[#525252] tabular-nums">
                      Max&nbsp;50&nbsp;MB
                    </span>
                    {selectedProvider === "swing-vision" && (
                      <a
                        href="https://swingvision.com/help/exporting-data"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-[6px] bg-white border border-[#F3F3F3] px-2 py-1 text-[10px] font-medium text-[#3B82F6] hover:text-[#2563EB] hover:border-[#3B82F6]/30 transition-colors duration-200"
                      >
                        How to export →
                      </a>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="animate-fadeIn space-y-3 flex flex-col">
            {/* Parse state strip */}
            {parsingState && (
              <>
                {parsingState.isParsing && (
                  <div className="animate-slideDown flex items-center gap-2 px-3 py-2 bg-[rgba(59,130,246,0.06)] border border-[rgba(59,130,246,0.15)] rounded-[10px]">
                    <Loader2 className="size-3.5 text-[#3B82F6] animate-spin flex-shrink-0" strokeWidth={1.5} />
                    <p className="text-[#3B82F6] text-[12px] font-medium">
                      Extracting match data…
                    </p>
                  </div>
                )}

                {parsingState.parseSuccess && (
                  <div className="animate-slideDown flex items-center gap-2 px-3 py-2 bg-[rgba(93,185,85,0.06)] border border-[rgba(93,185,85,0.18)] rounded-[10px]">
                    <CheckCircle2 className="size-3.5 text-[#5DB955] flex-shrink-0" strokeWidth={1.5} />
                    <p className="text-[#5DB955] text-[12px] font-medium">
                      Match data ready — proceed to next step.
                    </p>
                  </div>
                )}

                {parsingState.parseWarnings.length > 0 && (
                  <div className="animate-slideDown flex items-start gap-2 px-3 py-2 bg-[#FFFBEB] border border-[#FDE68A] rounded-[10px]">
                    <AlertTriangle className="size-3.5 text-[#92400E] mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                    <div>
                      <p className="text-[#92400E] text-[12px] font-medium">Parsing warnings</p>
                      <ul className="text-[#92400E] text-[12px] mt-1 space-y-0.5">
                        {parsingState.parseWarnings.map((warning, idx) => (
                          <li key={idx}>• {warning}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {parsingState.parseError && (
                  <div className="animate-slideDown p-3 bg-[rgba(229,24,55,0.06)] border border-[rgba(229,24,55,0.15)] rounded-[10px] flex items-start gap-2.5">
                    <AlertCircle className="size-3.5 text-[#E51837] mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                    <div>
                      <p className="text-[#E51837] text-[12px] font-medium">Parsing error</p>
                      <p className="text-[#E51837] text-[12px] mt-0.5">
                        {parsingState.parseError}
                      </p>
                      <p className="text-[#E51837] text-[12px] mt-1">
                        You can still enter data manually in the next step.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* File card */}
            <div className="rounded-[14px] bg-white border border-[#F3F3F3] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="px-4 py-3.5 flex items-center gap-3">
                <div className="size-10 rounded-[10px] bg-[#3B82F6] flex items-center justify-center flex-shrink-0">
                  <FileSpreadsheet className="size-5 text-white" strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[#0D0D0D] text-[13px] font-normal truncate">
                    {uploadedFile.name}
                  </p>
                  <p className="text-[#888888] text-[12px] mt-0.5 tabular-nums">
                    {uploadedFile.size}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onRemoveFile}
                  disabled={isUploading}
                  className="size-9 flex items-center justify-center rounded-[6px] text-[#888888] hover:text-[#E51837] hover:bg-[rgba(229,24,55,0.06)] transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
                  aria-label="Remove file"
                >
                  <Trash2 className="size-4" strokeWidth={1.5} />
                </button>
              </div>
            </div>

            <p className="text-[#888888] text-[12px] pt-1">
              You can swap this file any time before creating the match.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
