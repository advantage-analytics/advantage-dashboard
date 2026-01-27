import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processMatchToDb } from "@/lib/services/report/process-to-db";

interface ProcessMatchRequest {
  matchId: string;
  userId: string;
  fileNames: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ProcessMatchRequest;
    const { matchId, userId, fileNames } = body;

    if (!matchId || !userId || !Array.isArray(fileNames) || fileNames.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "matchId, userId, and a non-empty fileNames array are required",
        },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    await processMatchToDb({
      supabase,
      matchId,
      userId,
      fileNames,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error("Error in /api/process-match:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message ?? "Failed to process match data",
      },
      { status: 500 },
    );
  }
}

