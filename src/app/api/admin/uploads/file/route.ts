import { NextRequest, NextResponse } from "next/server";
import {
  getAdminMatchFileStatus,
  submitAdminMatchFile,
} from "@/lib/services/programs/admin-file-submission";
import { adminJson } from "@/lib/admin/uploads/http";
import { SUBMISSION_RESPONSE_INTERRUPTED_MESSAGE } from "@/lib/admin/uploads/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    return adminJson(await submitAdminMatchFile(await request.formData()));
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: SUBMISSION_RESPONSE_INTERRUPTED_MESSAGE,
      },
      { status: 500 },
    );
  }
}
export async function GET(request: NextRequest) {
  return adminJson(
    await getAdminMatchFileStatus(
      request.nextUrl.searchParams.get("operationId") ?? "",
      request.nextUrl.searchParams.get("itemId") ?? "",
    ),
  );
}
