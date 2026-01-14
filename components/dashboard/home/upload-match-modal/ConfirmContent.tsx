"use client";

/**
 * ConfirmContent - Step 5 content
 * Summary display of all entered data
 */

import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { FormData, UploadedFile } from "./types";

export interface ConfirmContentProps {
  formData: FormData;
  uploadedFile: UploadedFile | null;
  isPrivateMatch: boolean;
  error: string | null;
}

export function ConfirmContent({ formData, uploadedFile, isPrivateMatch, error }: ConfirmContentProps) {
  return (
    <Card className="rounded-xl">
      <CardContent className="p-6 space-y-4">
        {/* Event Information */}
        <div>
          <h4 className="font-semibold mb-2">Event Information</h4>
          <p className="text-sm">
            <strong>Event Name:</strong> {formData.eventName}
          </p>
          <p className="text-sm">
            <strong>Round:</strong> {formData.round}
          </p>
        </div>

        <Separator />

        {/* Match Information */}
        <div>
          <h4 className="font-semibold mb-2">Match Information</h4>
          <p className="text-sm">
            <strong>Player:</strong> {formData.playerName || "N/A"}
          </p>
          <p className="text-sm">
            <strong>Opponent:</strong> {formData.opponentName || "N/A"}
          </p>
          <p className="text-sm">
            <strong>Date:</strong> {formData.date}
          </p>
          <p className="text-sm">
            <strong>Result:</strong> {formData.result}
          </p>
        </div>

        {/* Uploaded File */}
        {uploadedFile && (
          <>
            <Separator />
            <div>
              <h4 className="font-semibold mb-2">Uploaded File</h4>
              <p className="text-sm">
                <strong>File:</strong> {uploadedFile.name}
              </p>
            </div>
          </>
        )}

        <Separator />

        {/* Privacy Setting */}
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold">Private Match</h4>
            <p className="text-sm text-gray-500">
              Note: All matches will be private during our Beta Testing
            </p>
          </div>
          <Switch
            checked={isPrivateMatch}
            disabled={true}
            className="opacity-50 cursor-not-allowed"
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
