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
    <div className="space-y-4">
      {/* Drag and Drop Area */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center ${
          isOver ? "border-blue-500 bg-blue-50" : "border-blue-400"
        }`}
      >
        <FolderOpen className="h-12 w-12 text-blue-500 mb-4" />
        <p className="text-sm text-gray-700 mb-2">Drag your file(s) to start uploading</p>
        <p className="text-xs text-gray-400 mb-4">OR</p>
        <label htmlFor="upload-input-modal">
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer"
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

      <p className="text-xs text-gray-500">Only support .csv files</p>

      {/* Uploaded File Card */}
      {uploadedFile && (
        <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black rounded flex items-center justify-center">
              <FolderOpen className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium">{uploadedFile.name}</p>
              <p className="text-xs text-gray-500">{uploadedFile.size}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemoveFile}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
