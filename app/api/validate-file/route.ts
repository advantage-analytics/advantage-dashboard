import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const execAsync = promisify(exec);

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

    // Decode base64 file
    const fileBuffer = Buffer.from(base64File.split(",")[1] || base64File, "base64");

    // Create temporary file
    const tempFilePath = join(tmpdir(), `validate-${Date.now()}-${fileName}`);
    
    try {
      // Write file to temp location
      await writeFile(tempFilePath, fileBuffer);

      // Get the path to the validation script
      const scriptPath = join(process.cwd(), "scripts", "validate_file.py");

      // Try python3 first, then python (for Windows compatibility)
      let stdout = "";
      let stderr = "";
      let pythonError: Error | null = null;

      try {
        const result = await execAsync(
          `python3 "${scriptPath}" --file-path "${tempFilePath}"`
        );
        stdout = result.stdout;
        stderr = result.stderr;
      } catch (error: any) {
        // If python3 fails, try python (Windows)
        try {
          const result = await execAsync(
            `python "${scriptPath}" --file-path "${tempFilePath}"`
          );
          stdout = result.stdout;
          stderr = result.stderr;
        } catch (error2: any) {
          pythonError = error2;
          stdout = error.stdout || error2.stdout || "";
          stderr = error.stderr || error2.stderr || "";
        }
      }

      // Clean up temp file
      await unlink(tempFilePath).catch(() => {
        // Ignore cleanup errors
      });

      // Try to parse JSON from stdout (even if command "failed")
      // The Python script outputs JSON to stdout even on validation failure
      if (stdout.trim()) {
        try {
          const result: ValidateFileResponse = JSON.parse(stdout.trim());
          
          // If validation failed, return the user-friendly error
          if (!result.success) {
            // Format a clear error message
            let errorMessage = result.error || "File validation failed";
            
            if (result.missing_sheets && result.missing_sheets.length > 0) {
              errorMessage = `Missing required sheets: ${result.missing_sheets.join(", ")}. `;
              errorMessage += `Required sheets: ${result.required_sheets?.join(", ") || "Settings, Shots, Points, Games, Sets, Stats"}`;
            } else if (result.extra_sheets && result.extra_sheets.length > 0) {
              errorMessage = `File contains unexpected sheets: ${result.extra_sheets.join(", ")}. `;
              errorMessage += `Only these 6 sheets are allowed: ${result.required_sheets?.join(", ") || "Settings, Shots, Points, Games, Sets, Stats"}`;
            } else if (result.validation_errors && result.validation_errors.length > 0) {
              errorMessage = result.validation_errors.join(". ");
            } else if (result.found_sheets) {
              errorMessage += ` Found ${result.found_sheets.length} sheet(s): ${result.found_sheets.join(", ")}`;
            }
            
            return NextResponse.json({
              success: false,
              error: errorMessage,
              ...result
            }, { status: 400 });
          }

          return NextResponse.json(result);
        } catch (parseError) {
          // stdout exists but isn't valid JSON - script might have crashed
          console.error("Failed to parse validation output:", stdout, stderr);
        }
      }

      // If we get here, the script didn't output valid JSON
      // Check if Python is installed
      if (pythonError && (stderr.includes("python3") || stderr.includes("python") || stderr.includes("not recognized"))) {
        return NextResponse.json(
          {
            success: false,
            error: "Python is not installed or not found in PATH. Please install Python 3 to validate files.",
          },
          { status: 500 }
        );
      }

      // Generic error with stderr if available
      const errorMessage = stderr 
        ? `Validation failed: ${stderr.trim()}`
        : "File validation failed. Please ensure the file is a valid SwingVision Excel export.";

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
        },
        { status: 500 }
      );
    } catch (error: any) {
      // Clean up temp file on error
      await unlink(tempFilePath).catch(() => {
        // Ignore cleanup errors
      });

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
