"use client";

/**
 * UploadContent - Step 3 content
 * File upload zone with drag-and-drop support.
 *
 * States: no-provider (disabled) → idle → drag-over → uploading → uploaded
 * Provider-aware: accept type and SwingVision help link gated to provider.
 */

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  Trash2,
  Upload,
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

const SWING_VISION_HELP_URL =
  "https://help.swing.tennis/en/articles/8089748-exporting-match-data";

type BannerTone = "info" | "success" | "warning" | "error";

const BANNER_TONES: Record<
  BannerTone,
  { bg: string; border: string; fg: string }
> = {
  info: {
    bg: "var(--color-player-1-bar-tint)",
    border: "rgba(59, 130, 246, 0.2)",
    fg: "#3B82F6",
  },
  success: {
    bg: "rgba(93, 185, 90, 0.08)",
    border: "rgba(93, 185, 90, 0.25)",
    fg: "#3F8A3D",
  },
  warning: {
    bg: "rgba(217, 119, 6, 0.06)",
    border: "rgba(217, 119, 6, 0.22)",
    fg: "#B45309",
  },
  error: {
    bg: "var(--color-error-bg)",
    border: "rgba(229, 24, 55, 0.2)",
    fg: "#E51837",
  },
};

function StatusBanner({
  tone,
  icon: Icon,
  spinIcon = false,
  align = "center",
  children,
}: {
  tone: BannerTone;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  spinIcon?: boolean;
  align?: "center" | "start";
  children: React.ReactNode;
}) {
  const palette = BANNER_TONES[tone];
  return (
    <div
      className={`animate-slideDown flex gap-2.5 px-3 py-2.5 rounded-[10px] border ${
        align === "start" ? "items-start" : "items-center"
      }`}
      style={{ backgroundColor: palette.bg, borderColor: palette.border }}
    >
      <Icon
        className={`h-4 w-4 flex-shrink-0 ${align === "start" ? "mt-0.5" : ""} ${
          spinIcon ? "animate-spin" : ""
        }`}
        style={{ color: tone === "success" ? "#5DB955" : palette.fg }}
      />
      <div className="min-w-0" style={{ color: palette.fg }}>
        {children}
      </div>
    </div>
  );
}

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
  const noProvider = !selectedProvider;
  const fileConfig = selectedProvider
    ? PROVIDER_FILE_CONFIG[selectedProvider]
    : { accept: ".csv,.xlsx", description: "Select a provider first" };

  const hasFile = !!uploadedFile;
  const isSwingVision = selectedProvider === "swing-vision";

  return (
    <div className="flex flex-col h-full gap-3 animate-fadeIn">
      {uploadError && (
        <StatusBanner tone="error" icon={AlertCircle} align="start">
          <p className="text-[12px] font-medium leading-tight">Upload error</p>
          <p className="text-[12px] leading-relaxed mt-0.5">{uploadError}</p>
        </StatusBanner>
      )}

      {/* Main content */}
      <div className="flex flex-col flex-1 gap-3 min-h-0">
        {!hasFile ? (
          <>
            {/* Dropzone */}
            <div
              onDragOver={noProvider ? undefined : onDragOver}
              onDragLeave={noProvider ? undefined : onDragLeave}
              onDrop={noProvider ? undefined : onDrop}
              aria-disabled={noProvider}
              className={`relative flex-1 rounded-[14px] border border-dashed transition-colors duration-200 group flex flex-col items-center justify-center ${
                noProvider
                  ? "border-[#F3F3F3] bg-[#FAFAFA] cursor-not-allowed"
                  : isUploading
                    ? "border-[#AAAAAA] bg-[#FAFAFA]"
                    : isOver
                      ? "border-[#3B82F6] bg-[#3B82F6]/[0.04]"
                      : "border-[#AAAAAA]/60 bg-white hover:border-[#3B82F6] hover:bg-[#FAFAFA]"
              }`}
            >
              {/* Hover/drag tint */}
              {!noProvider && !isUploading && (
                <div
                  className={`absolute inset-0 rounded-[14px] pointer-events-none transition-opacity duration-200 ${
                    isOver ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                  style={{
                    background:
                      "radial-gradient(circle 360px at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(59, 130, 246, 0.08), transparent)",
                  }}
                />
              )}

              <div className="relative z-10 flex flex-col items-center justify-center gap-5 px-6 py-8">
                {isUploading ? (
                  <div className="flex flex-col items-center gap-3 animate-fadeIn">
                    <div className="relative w-11 h-11 flex items-center justify-center">
                      <Loader2
                        className="h-5 w-5 animate-spin"
                        style={{ color: "#3B82F6" }}
                      />
                    </div>
                    <p className="text-[13px] font-medium tracking-[-0.1px] text-[#0D0D0D]">
                      Validating file
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Icon plate */}
                    <div
                      className={`relative w-12 h-12 flex items-center justify-center rounded-[12px] transition-all duration-200 ${
                        noProvider
                          ? "bg-[#F3F3F3]"
                          : isOver
                            ? "bg-[#3B82F6] shadow-[0_4px_12px_rgba(59,130,246,0.28)]"
                            : "bg-[#F3F3F3] group-hover:bg-[#3B82F6]/10"
                      }`}
                    >
                      <Upload
                        className={`h-5 w-5 transition-colors duration-200 ${
                          noProvider
                            ? "text-[#AAAAAA]"
                            : isOver
                              ? "text-white"
                              : "text-[#525252] group-hover:text-[#3B82F6]"
                        }`}
                        strokeWidth={1.75}
                      />
                    </div>

                    {/* Copy */}
                    <div className="flex flex-col items-center text-center gap-1">
                      <p className="text-[14px] font-medium tracking-[-0.1px] text-[#0D0D0D]">
                        {noProvider
                          ? "Select a provider to continue"
                          : isOver
                            ? "Drop to upload"
                            : "Drag your file here"}
                      </p>
                      <p className="text-[12px] leading-relaxed text-[#888888]">
                        {noProvider
                          ? "Go back to choose a data source first"
                          : "or browse from your computer"}
                      </p>
                    </div>

                    {/* Browse button */}
                    <button
                      type="button"
                      disabled={noProvider}
                      onClick={() =>
                        document.getElementById("upload-input-modal")?.click()
                      }
                      className="h-9 px-4 rounded-[6px] text-[13px] font-medium tracking-[0.5px] bg-[#3B82F6] hover:bg-[#2563EB] text-white shadow-[0_1px_3px_rgba(57,134,243,0.25)] transition-[background-color,transform,box-shadow] duration-200 active:scale-[0.97] disabled:bg-[#AAAAAA] disabled:shadow-none disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:ring-offset-1"
                    >
                      Browse files
                    </button>

                    {/* Footer info row */}
                    <div className="flex items-center gap-2 pt-1 text-[11px] tracking-[0.2px] text-[#888888]">
                      <span>{fileConfig.description}</span>
                      <span className="text-[#AAAAAA]">·</span>
                      <span>Max 50MB</span>
                    </div>

                    <input
                      id="upload-input-modal"
                      type="file"
                      onChange={onFileChange}
                      className="hidden"
                      accept={fileConfig.accept}
                      disabled={isUploading || noProvider}
                    />
                  </>
                )}
              </div>
            </div>

            {/* Help link — anchored to dropzone, only when SwingVision selected */}
            {isSwingVision && !isUploading && (
              <a
                href={SWING_VISION_HELP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="self-center inline-flex items-center gap-1.5 text-[12px] font-medium text-[#525252] hover:text-[#3B82F6] transition-colors duration-200"
              >
                How to export from SwingVision
                <ExternalLink className="h-3 w-3" strokeWidth={2} />
              </a>
            )}
          </>
        ) : (
          <div className="animate-fadeIn flex flex-col gap-3">
            {/* Parsing-state banners */}
            {parsingState && (
              <>
                {parsingState.isParsing && (
                  <StatusBanner tone="info" icon={Loader2} spinIcon>
                    <p className="text-[12px] font-medium">
                      Extracting match data…
                    </p>
                  </StatusBanner>
                )}

                {parsingState.parseSuccess && (
                  <StatusBanner tone="success" icon={CheckCircle2}>
                    <p className="text-[12px] font-medium">
                      Match data extracted — ready to proceed
                    </p>
                  </StatusBanner>
                )}

                {parsingState.parseWarnings.length > 0 && (
                  <StatusBanner
                    tone="warning"
                    icon={AlertTriangle}
                    align="start"
                  >
                    <p className="text-[12px] font-medium leading-tight">
                      Parsing warnings
                    </p>
                    <ul className="text-[12px] mt-1 space-y-0.5">
                      {parsingState.parseWarnings.map((warning, idx) => (
                        <li key={idx}>· {warning}</li>
                      ))}
                    </ul>
                  </StatusBanner>
                )}

                {parsingState.parseError && (
                  <StatusBanner tone="error" icon={AlertCircle} align="start">
                    <p className="text-[12px] font-medium leading-tight">
                      Parsing error
                    </p>
                    <p className="text-[12px] mt-0.5 leading-relaxed">
                      {parsingState.parseError}
                    </p>
                    <p
                      className="text-[12px] mt-1 leading-relaxed"
                      style={{ opacity: 0.85 }}
                    >
                      You can still enter data manually in the next step.
                    </p>
                  </StatusBanner>
                )}
              </>
            )}

            {/* File card */}
            <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-card overflow-hidden">
              <div className="px-4 py-3.5 flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "#3B82F6" }}
                >
                  <FileSpreadsheet
                    className="h-5 w-5 text-white"
                    strokeWidth={1.75}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium tracking-[-0.1px] text-[#0D0D0D] truncate">
                    {uploadedFile.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px] tracking-[0.2px] text-[#888888]">
                      {uploadedFile.size}
                    </span>
                    {parsingState?.parseSuccess && (
                      <>
                        <span className="text-[#AAAAAA] text-[11px]">·</span>
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-medium tracking-[0.2px]"
                          style={{ color: "#5DB955" }}
                        >
                          <CheckCircle2
                            className="h-3 w-3"
                            strokeWidth={2.25}
                          />
                          Ready
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onRemoveFile}
                  disabled={isUploading}
                  className="flex items-center justify-center w-8 h-8 rounded-[8px] text-[#888888] hover:text-[#E51837] hover:bg-[#F3F3F3] transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
                  aria-label="Remove file"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            <p className="text-[11px] tracking-[0.2px] text-[#888888]">
              You can swap this file any time before creating the match.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
