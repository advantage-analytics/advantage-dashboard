import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { swingVisionStrategy } from "@/lib/services/upload";
import { validateSwingVisionFile } from "@/lib/services/upload/validators/swingvision-validator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

/**
 * The longest base64 payload a file inside SwingVision's size ceiling can
 * produce: four characters per three bytes, rounded up to a whole quartet.
 * Derived from the strategy's `maxFileSizeMB` so the two limits cannot drift
 * apart — the wizard has already applied that one to the raw file, and this
 * is the same number in the shape this route receives it.
 */
const MAX_BASE64_LENGTH =
  Math.ceil((swingVisionStrategy.config.maxFileSizeMB * 1024 * 1024) / 3) * 4;

/** The one message either 500 branch returns; the cause goes to the log. */
const VALIDATION_FAILED = "Failed to validate file. Please try again.";

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ValidateFileResponse>> {
  try {
    // Signed-in callers only — same gate and shape as `/api/upload`, which is
    // the only place this route's verdict is ever acted on.
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body: ValidateFileRequest = await request.json();
    const { file: base64File, fileName } = body;

    if (!base64File || !fileName) {
      return NextResponse.json(
        {
          success: false,
          error: "File data and file name are required",
        },
        { status: 400 },
      );
    }

    // The wizard sends a data URL; take the payload after the comma, or the
    // whole string when there is no prefix.
    const base64Data = base64File.split(",")[1] || base64File;

    // Refuse before decoding: `Buffer.from` on an oversized body is the
    // expensive step, and the strategy's ceiling already rules the file out.
    if (base64Data.length > MAX_BASE64_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: `File too large. Maximum size is ${swingVisionStrategy.config.maxFileSizeMB}MB.`,
        },
        { status: 413 },
      );
    }

    try {
      // Decode base64 file to buffer
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
          { status: 400 },
        );
      }

      return NextResponse.json(validationResult);
    } catch (error: unknown) {
      // The cause stays in the log: a parser's message can name sheets, cells
      // or paths that are nobody's business on the wire.
      console.error("File validation error:", error);
      return NextResponse.json(
        { success: false, error: VALIDATION_FAILED },
        { status: 500 },
      );
    }
  } catch (error: unknown) {
    console.error("File validation error:", error);
    return NextResponse.json(
      { success: false, error: VALIDATION_FAILED },
      { status: 500 },
    );
  }
}
