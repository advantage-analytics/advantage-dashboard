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
  FolderOpen,
  AlertCircle,
  Loader2,
  CheckCircle2,
  File,
  Upload,
  Trash2,
  FileSpreadsheet,
} from "lucide-react";
import { UploadedFile } from "./types";
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

export interface UploadContentProps {
  sourceType: string;
  selectedProvider: ProviderId | null;
  uploadedFile: UploadedFile | null;
  isOver: boolean;
  isUploading?: boolean;
  uploadError?: string | null;
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
    <div className="flex flex-col h-full gap-3 animate-fadeIn">
      {/* Error State - Compact and at top */}
      {uploadError && (
        <div className="animate-slideDown">
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-red-700 text-xs font-semibold">Upload Error</p>
              <p className="text-red-600 text-xs mt-0.5">{uploadError}</p>
            </div>
          </div>
        </div>
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
              className={`relative flex-1 border-2 border-dashed rounded-2xl transition-all duration-300 overflow-hidden group flex flex-col items-center justify-center ${
                isUploading
                  ? "border-gray-300 bg-gray-50"
                  : isOver
                    ? "border-[#3B82F6] bg-[#3B82F6]/5"
                    : "border-[#EAECF0] hover:border-[#3B82F6] hover:bg-[#F0F7FF]"
              }`}
            >
              {/* Background gradient effect on hover */}
              <div
                className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none ${
                  isOver ? "opacity-100" : ""
                }`}
                style={{
                  background:
                    "radial-gradient(circle 400px at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(59, 130, 246, 0.1), transparent)",
                }}
              />

              {/* Content - Properly centered */}
              <div className="relative z-10 flex flex-col items-center justify-center gap-4 px-6">
                {isUploading ? (
                  <>
                    {/* Loading State */}
                    <div className="flex flex-col items-center gap-3 animate-fadeIn">
                      <div className="relative w-14 h-14 flex items-center justify-center">
                        <div className="absolute inset-0 bg-gradient-to-r from-[#3B82F6]/20 to-transparent rounded-full animate-spin" />
                        <Loader2 className="h-7 w-7 text-[#3B82F6] animate-spin" />
                      </div>
                      <p className="text-[#0D0D0D] font-semibold text-sm">
                        Validating file...
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Upload Prompt */}
                    <div className="flex flex-col items-center gap-3 text-center">
                      {/* Icon */}
                      <div
                        className={`relative w-16 h-16 flex items-center justify-center rounded-2xl transition-all duration-300 ${
                          isOver
                            ? "bg-[#3B82F6] scale-110"
                            : "bg-[#F0F4FF] group-hover:bg-[#3B82F6]"
                        }`}
                      >
                        <Upload
                          className={`h-8 w-8 transition-all duration-300 ${
                            isOver
                              ? "text-white scale-110"
                              : "text-[#3B82F6] group-hover:text-white"
                          }`}
                        />
                      </div>

                      {/* Text Content */}
                      <div className="space-y-1.5">
                        <p className="text-[#0D0D0D] font-semibold text-sm">
                          Drag your file here
                        </p>
                        <p className="text-[#999999] text-xs leading-relaxed">
                          or click the button below to browse
                        </p>
                      </div>

                      {/* File Info */}
                      <p className="text-[#999999] text-xs pt-1">
                        {fileConfig.description} •{" "}
                        <span className="font-medium">Max 50MB</span>
                      </p>
                    </div>

                    {/* Browse Button */}
                    <div className="pt-2">
                      <label htmlFor="upload-input-modal" className="block">
                        <Button
                          type="button"
                          className="bg-[#0D0D0D] hover:bg-[#1D1D1D] text-white text-xs font-semibold rounded-lg px-6 py-2 transition-all duration-200 active:scale-95"
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
            <div className="animate-fadeIn space-y-3 flex flex-col">
              {/* Success Badge */}
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg w-fit">
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                <p className="text-green-700 text-xs font-semibold">
                  File selected
                </p>
              </div>

              {/* File Card */}
              <div className="border border-[#EAECF0] rounded-xl bg-white overflow-hidden hover:border-[#3B82F6]/30 transition-all duration-300">
                {/* Card Header */}
                <div className="px-4 py-3 border-b border-[#EAECF0] bg-[#FAFBFC] flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-[#3B82F6] rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileSpreadsheet className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[#0D0D0D] font-semibold text-sm truncate">
                        {uploadedFile.name}
                      </p>
                      <p className="text-[#999999] text-xs">{uploadedFile.size}</p>
                    </div>
                  </div>
                </div>

                {/* Card Footer - Action */}
                <div className="px-4 py-3 flex items-center justify-between bg-white">
                  <p className="text-[#999999] text-xs">
                    Ready to proceed to next step
                  </p>
                  <button
                    type="button"
                    onClick={onRemoveFile}
                    disabled={isUploading}
                    className="p-2 text-[#999999] hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Remove file"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Info Text */}
              <p className="text-[#999999] text-xs pt-1">
                You can change this file at any time before creating the match.
              </p>
            </div>
          </>
        )}
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 300ms ease-out;
        }

        .animate-slideDown {
          animation: slideDown 300ms ease-out;
        }
      `}</style>
    </div>
  );
}
