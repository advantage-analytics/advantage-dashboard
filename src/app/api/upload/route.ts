/**
 * Upload API Route
 *
 * Server-side handler for file uploads.
 * Performs authentication, validation, and storage operations.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createUploadService,
  getImportProviderStrategy,
  isProviderSupported,
  ProviderId,
} from "@/lib/services/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Response type for upload API */
interface UploadApiResponse {
  success: boolean;
  fileId?: string;
  storagePath?: string;
  error?: string;
}

/**
 * POST /api/upload
 *
 * Upload a match data file for a specific provider.
 *
 * Required form data:
 * - file: The file to upload
 * - matchId: UUID of the match
 * - providerId: Provider identifier (e.g., 'swing-vision')
 */
export async function POST(
  request: NextRequest,
): Promise<NextResponse<UploadApiResponse>> {
  try {
    // 1. Initialize Supabase client and authenticate
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

    // 2. Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const matchId = formData.get("matchId") as string | null;
    const providerId = formData.get("providerId") as string | null;

    // 3. Validate required fields
    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 },
      );
    }

    if (!matchId) {
      return NextResponse.json(
        { success: false, error: "No matchId provided" },
        { status: 400 },
      );
    }

    if (!providerId) {
      return NextResponse.json(
        { success: false, error: "No providerId provided" },
        { status: 400 },
      );
    }

    // 4. Validate provider
    if (!isProviderSupported(providerId)) {
      return NextResponse.json(
        { success: false, error: `Unsupported provider: ${providerId}` },
        { status: 400 },
      );
    }

    // 5. Get provider strategy and validate file. This route handles parseable
    //    files only — a processing provider's video never comes through here,
    //    so getImportProviderStrategy throwing is the correct outcome.
    let strategy;
    try {
      strategy = getImportProviderStrategy(providerId as ProviderId);
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          error: err instanceof Error ? err.message : "Unsupported provider",
        },
        { status: 400 },
      );
    }
    const validationResult = strategy.validateFile(file);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: validationResult.error },
        { status: 400 },
      );
    }

    // 6. The match must be visible to the caller and theirs. Read through the
    //    caller's own client so RLS answers the first question: a row the
    //    caller cannot see is a 404, a row they can see but did not create is
    //    a 403. `created_by === user.id` holds on every wizard path — the
    //    create path inserts the row under the uploader immediately before
    //    this POST, and the existing-line path refuses a row that is someone
    //    else's. Until now the route left ownership to the live
    //    `match_files_guard_upload_eligibility` trigger, which only fires
    //    AFTER the bytes have landed in storage.
    const { data: match, error: matchError } = await supabase
      .from("matches")
      .select("id, created_by")
      .eq("id", matchId)
      .maybeSingle();

    if (matchError) {
      console.error("Upload API: failed to load match", matchError);
      return NextResponse.json(
        { success: false, error: "Failed to load match" },
        { status: 500 },
      );
    }

    if (!match) {
      return NextResponse.json(
        { success: false, error: "Match not found" },
        { status: 404 },
      );
    }

    if (match.created_by !== user.id) {
      return NextResponse.json(
        {
          success: false,
          error: "You can only upload files to your own matches",
        },
        { status: 403 },
      );
    }

    // 7. Once per match. `process-match` inserts points and shots
    //    unconditionally, so a retried POST against a match that already has
    //    a file — or already has statistics — would double every number. The
    //    wizard uploads exactly one file per match, so refusing a second one
    //    breaks nothing; the function's own 409 (T9) is the backstop, this is
    //    the check that keeps the bytes out of storage in the first place.
    const [
      { data: existingFiles, error: filesError },
      { data: existingPoints, error: pointsError },
    ] = await Promise.all([
      supabase
        .from("match_files")
        .select("id")
        .eq("match_id", matchId)
        .limit(1),
      supabase.from("points").select("id").eq("match_id", matchId).limit(1),
    ]);

    if (filesError || pointsError) {
      console.error(
        "Upload API: failed to check for an existing file",
        filesError ?? pointsError,
      );
      return NextResponse.json(
        { success: false, error: "Failed to check for an existing file" },
        { status: 500 },
      );
    }

    if (
      (existingFiles && existingFiles.length > 0) ||
      (existingPoints && existingPoints.length > 0)
    ) {
      return NextResponse.json(
        { success: false, error: "This match already has a file" },
        { status: 409 },
      );
    }

    // 8. Create upload service and upload file
    const uploadService = createUploadService(supabase);
    const uploadResult = await uploadService.uploadMatchFile({
      file,
      userId: user.id,
      matchId,
      providerId: providerId as ProviderId,
    });

    if (!uploadResult.success) {
      return NextResponse.json(
        { success: false, error: uploadResult.error },
        { status: 500 },
      );
    }

    // 9. Trigger Edge Function to process match data (fire and forget)
    // Get all files for this match to pass to the Edge Function
    try {
      const { data: matchFiles } = await supabase
        .from("match_files")
        .select("storage_path, file_name")
        .eq("match_id", matchId);

      if (matchFiles && matchFiles.length > 0) {
        const fileNames = matchFiles
          .map((f) => f.storage_path || f.file_name)
          .filter((v): v is string => Boolean(v));

        // Fetch source_provider from match record
        const { data: match } = await supabase
          .from("matches")
          .select("source_provider")
          .eq("id", matchId)
          .single();

        // Call Edge Function asynchronously (don't wait for response)
        supabase.functions
          .invoke("process-match", {
            body: {
              matchId,
              userId: user.id,
              fileNames,
              sourceProvider: match?.source_provider || null,
            },
          })
          .catch((err) => {
            // Log error but don't fail the upload
            console.error("Error triggering process-match Edge Function:", err);
          });
      }
    } catch (err) {
      // Log error but don't fail the upload
      console.error("Error fetching match files for Edge Function:", err);
    }

    // 10. Return success response
    return NextResponse.json({
      success: true,
      fileId: uploadResult.fileId,
      storagePath: uploadResult.storagePath,
    });
  } catch (error) {
    console.error("Upload API error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
