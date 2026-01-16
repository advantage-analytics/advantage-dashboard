"use client";

/**
 * UploadContent - Step 3 content
 * File upload zone with drag-and-drop support
 *
 * Enforces single file upload per match.
 * Accepts provider-specific file types based on selected provider.
 */

import { Button } from "@/components/ui/button";
import { FolderOpen, AlertCircle, Loader2, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { UploadedFile } from "./types";
import { ProviderId } from "@/lib/services/upload";

/** File type configuration per provider */
const PROVIDER_FILE_CONFIG: Record<ProviderId, { accept: string; description: string; icon: string }> = {
  'swing-vision': {
    accept: '.xlsx',
    description: 'Upload your SwingVision export file (.xlsx)',
    icon: 'xlsx',
  },
  'atp-tour': {
    accept: '.csv',
    description: 'Upload your ATP Tour data file (.csv)',
    icon: 'csv',
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
  onRemoveFile
}: UploadContentProps) {
  // Get provider-specific file configuration
  const fileConfig = selectedProvider
    ? PROVIDER_FILE_CONFIG[selectedProvider]
    : { accept: '.csv,.xlsx', description: 'Select a provider first', icon: 'file' };

  // Determine if we should show the upload zone or the uploaded file
  const hasFile = !!uploadedFile;

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Error Message */}
      {uploadError && (
        <div className="w-full p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-red-600 text-xs">{uploadError}</p>
        </div>
      )}

      {/* Show upload zone only if no file is uploaded */}
      {!hasFile && (
        <>
          {/* Drag and Drop Area */}
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`w-full border-2 border-dashed rounded-2xl flex flex-col items-center justify-center py-8 px-4 transition-colors ${
              isUploading
                ? "border-gray-300 bg-gray-50 cursor-not-allowed"
                : isOver
                  ? "border-[#3986F3] bg-blue-50"
                  : "border-[#3986F3] hover:bg-blue-50/50"
            }`}
          >
            {isUploading ? (
              <>
                <Loader2 className="h-8 w-8 text-[#3986F3] mb-4 animate-spin" />
                <p className="text-[#0D0D0D] font-normal text-sm">
                  Validating file...
                </p>
              </>
            ) : (
              <>
                <FolderOpen className="h-8 w-8 text-[#3986F3] mb-4" />
                <p className="text-[#0D0D0D] font-normal text-sm mb-4">
                  Drag your file here to upload
                </p>

                {/* OR Separator */}
                <div className="flex items-center gap-2 w-full mb-4">
                  <div className="flex-1 h-px bg-[#E5E5E5]"></div>
                  <span className="text-[#999999] font-normal text-xs uppercase">OR</span>
                  <div className="flex-1 h-px bg-[#E5E5E5]"></div>
                </div>

                <label htmlFor="upload-input-modal" className="cursor-pointer">
                  <Button
                    type="button"
                    className="bg-white border-3 text-[#3986F3] text-xs border border-[#3986F3] rounded-lg px-4 py-1 hover:bg-blue-50 transition-colors shadow-none"
                    onClick={() => document.getElementById("upload-input-modal")?.click()}
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
                />
              </>
            )}
          </div>

          {/* File Type Restriction */}
          <p className="text-[#999999] font-normal text-xs self-start">
            {fileConfig.description}
          </p>
        </>
      )}

      {/* Uploaded File Card - Show when file is uploaded */}
      {hasFile && (
        <div className="w-full">
          {/* Success message */}
          <div className="w-full p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 mb-4">
            <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
            <p className="text-green-700 text-xs font-medium">File ready for upload</p>
          </div>

          {/* File card */}
          <div className="w-full flex items-center justify-between p-4 bg-white border border-[#E5E5E5] rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#3986F3] rounded-lg flex items-center justify-center">
                <FileSpreadsheet className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-[#0D0D0D] font-medium text-sm">{uploadedFile.name}</p>
                <p className="text-[#999999] font-normal text-xs">{uploadedFile.size}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onRemoveFile}
              disabled={isUploading}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isUploading
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-red-50 text-red-600 hover:bg-red-100"
              }`}
            >
              Remove
            </button>
          </div>

          {/* Helper text */}
          <p className="text-[#999999] font-normal text-xs mt-3">
            Click "Continue" to proceed with this file, or remove it to select a different one.
          </p>
        </div>
      )}
    </div>
  );
}
