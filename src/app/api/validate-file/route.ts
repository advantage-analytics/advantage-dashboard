import { NextRequest, NextResponse } from "next/server";
import { validateSwingVisionFile } from "@/lib/services/upload/validators/swingvision-validator";

interface ValidateFileRequest {
  file: string; // base64 encoded file
  fileName: string;
}

interface ValidateFileResponse {
  success: boolean;
  error?: string;
  validation_errors?: string[];
  found_sheets?: string[];
  required_sheets?: string[];
  missing_sheets?: string[];
  extra_sheets?: string[];
  message?: string;
  sheets_validated?: string[];
  total_rows?: Record<string, number>;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ValidateFileResponse>> {
  try {
    const body: ValidateFileRequest = await request.json();
    const { file: base64File, fileName } = body;

    if (!base64File || !fileName) {
      return NextResponse.json(
        {
          success: false,
          error: "File data and file name are required",
        },
        { status: 400 }
      );
    }

    try {
      // Decode base64 file to buffer
      const base64Data = base64File.split(",")[1] || base64File;
      const fileBuffer = Buffer.from(base64Data, "base64");

      // Create a File object from the buffer
      const file = new File([fileBuffer], fileName, {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      // Validate the file using TypeScript validator
      const validationResult = await validateSwingVisionFile(file);

      if (!validationResult.success) {
        // Format a clear error message
        let errorMessage = validationResult.error || "File validation failed";

        if (
          validationResult.missing_sheets &&
          validationResult.missing_sheets.length > 0
        ) {
          errorMessage = `Missing required sheets: ${validationResult.missing_sheets.join(", ")}. `;
          errorMessage += `Required sheets: ${validationResult.required_sheets?.join(", ") || "Settings, Shots, Points, Games, Sets, Stats"}`;
        } else if (
          validationResult.extra_sheets &&
          validationResult.extra_sheets.length > 0
        ) {
          errorMessage = `File contains unexpected sheets: ${validationResult.extra_sheets.join(", ")}. `;
          errorMessage += `Only these 6 sheets are allowed: ${validationResult.required_sheets?.join(", ") || "Settings, Shots, Points, Games, Sets, Stats"}`;
        } else if (
          validationResult.validation_errors &&
          validationResult.validation_errors.length > 0
        ) {
          errorMessage = validationResult.validation_errors.join(". ");
        }

        return NextResponse.json(
          {
            ...validationResult,
            error: errorMessage,
          },
          { status: 400 }
        );
      }

      return NextResponse.json(validationResult);
    } catch (error: any) {
      console.error("File validation error:", error);
      return NextResponse.json(
        {
          success: false,
          error: error.message || "Failed to validate file. Please try again.",
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("File validation error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to validate file",
      },
      { status: 500 }
    );
  }
}
