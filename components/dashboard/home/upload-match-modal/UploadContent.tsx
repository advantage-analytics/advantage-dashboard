"use client";

/**
 * UploadContent - Step 3 content
 * File upload zone with drag-and-drop support
 */

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Trash2, Upload as UploadIcon } from "lucide-react";
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
  sourceType,
  uploadedFile,
  isOver,
  onSourceTypeChange,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileChange,
  onRemoveFile
}: UploadContentProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="text-sm font-medium">Data Type</div>
        <Select value={sourceType} onValueChange={onSourceTypeChange}>
          <SelectTrigger className="w-full justify-between">
            <SelectValue>{sourceType}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Swingvision">Swingvision</SelectItem>
            <SelectItem value="ATP">ATP</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="rounded-xl">
        <CardContent className="p-0">
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`rounded-xl flex items-center justify-center h-52 text-sm text-muted-foreground ${
              isOver ? "bg-primary/5" : ""
            } cursor-pointer`}
          >
            <label className="w-full h-full flex items-center justify-center" htmlFor="upload-input-modal">
              <div className="text-center select-none">
                <div className="mb-2 flex items-center justify-center">
                  <UploadIcon className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>Upload Match Data</div>
              </div>
              <input
                id="upload-input-modal"
                type="file"
                onChange={onFileChange}
                className="hidden"
                accept=".xlsx,.xls"
              />
            </label>
          </div>
        </CardContent>
      </Card>

      {uploadedFile && (
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-500 rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">XLSX</span>
            </div>
            <div>
              <p className="text-sm font-medium">{uploadedFile.name}</p>
              <p className="text-xs text-gray-500">{uploadedFile.size}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-green-600">
              <Check className="h-4 w-4" />
              <span className="text-sm">{uploadedFile.status}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemoveFile}
              className="text-gray-500 hover:text-red-500"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
