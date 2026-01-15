"use client";

/**
 * UploadContent - Step 3 content
 * File upload zone with drag-and-drop support
 */

import { Button } from "@/components/ui/button";
import { FolderOpen, X } from "lucide-react";
import { UploadedFile } from "./types";

export interface UploadContentProps {
  sourceType: string;
  uploadedFile: UploadedFile | null;
  isOver: boolean;
  onSourceTypeChange: (type: string) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: React.DragEventHandler<HTMLDivElement>;
  onFileChange: React.ChangeEventHandler<HTMLInputElement>;
  onRemoveFile: () => void;
}

export function UploadContent({
  uploadedFile,
  isOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileChange,
  onRemoveFile
}: UploadContentProps) {
  return (
    <div className="flex flex-col items-center gap-6">
      {/* Drag and Drop Area */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`w-full border-2 border-dashed rounded-2xl flex flex-col items-center justify-center py-8 px-4 ${
          isOver ? "border-[#3986F3] bg-blue-50" : "border-[#3986F3]"
        }`}
      >
        <FolderOpen className="h-8 w-8 text-[#3986F3] mb-4" />
        <p className="text-[#0D0D0D] font-normal text-sm mb-4">
          Drag your file(s) to start uploading
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
            className="bg-white border-3 text-[#3986F3] text-xs border border-[#3986F3] rounded-lg px-4 py-1 hover:bg-blue-400 transition-colors shadow-none"
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
          accept=".csv"
        />
      </div>

      {/* File Type Restriction */}
      <p className="text-[#999999] font-normal text-xs self-start">
        Only support .csv files
      </p>

      {/* Uploaded File Card */}
      {uploadedFile && (
        <div className="w-full flex items-center justify-between p-4 bg-white border border-[#E5E5E5] rounded-[4px]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0D0D0D] rounded flex items-center justify-center">
              <FolderOpen className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[#0D0D0D] font-medium text-xs">{uploadedFile.name}</p>
              <p className="text-[#999999] font-normal text-xs">{uploadedFile.size}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRemoveFile}
            className="w-6 h-6 rounded-full bg-[#F7F7F7] flex items-center justify-center text-[#999999] hover:text-[#0D0D0D] hover:bg-[#E5E5E5] transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
