/**
 * Upload API Route
 *
 * Server-side handler for file uploads.
 * Performs authentication, validation, and storage operations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  createUploadService,
  getProviderStrategy,
  isProviderSupported,
  ProviderId,
} from '@/lib/services/upload';

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
  request: NextRequest
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
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const matchId = formData.get('matchId') as string | null;
    const providerId = formData.get('providerId') as string | null;

    // 3. Validate required fields
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!matchId) {
      return NextResponse.json(
        { success: false, error: 'No matchId provided' },
        { status: 400 }
      );
    }

    if (!providerId) {
      return NextResponse.json(
        { success: false, error: 'No providerId provided' },
        { status: 400 }
      );
    }

    // 4. Validate provider
    if (!isProviderSupported(providerId)) {
      return NextResponse.json(
        { success: false, error: `Unsupported provider: ${providerId}` },
        { status: 400 }
      );
    }

    // 5. Get provider strategy and validate file
    const strategy = getProviderStrategy(providerId as ProviderId);
    const validationResult = strategy.validateFile(file);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: validationResult.error },
        { status: 400 }
      );
    }

    // 6. Create upload service and upload file
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
        { status: 500 }
      );
    }

    // 7. Return success response
    return NextResponse.json({
      success: true,
      fileId: uploadResult.fileId,
      storagePath: uploadResult.storagePath,
    });
  } catch (error) {
    console.error('Upload API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
