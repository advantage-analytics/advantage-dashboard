import { NextRequest, NextResponse } from "next/server";
import {
  getAdminMatchFileStatus,
  submitAdminMatchFile,
} from "@/lib/services/programs/admin-file-submission";
import { SUBMISSION_RESPONSE_INTERRUPTED_MESSAGE } from "@/lib/admin/uploads/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * A refusal answers its own status — 401 no session, 403 not an admin, 400 a
 * bad request — and the body stays `{ ok, message }`, all the wizard reads.
 */
function answer(
  result:
    { ok: true } | { ok: false; status: 400 | 401 | 403; message: string },
) {
  if (result.ok) return NextResponse.json(result);
  const { status, ...body } = result;
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  try {
    return answer(await submitAdminMatchFile(await request.formData()));
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
  return answer(
    await getAdminMatchFileStatus(
      request.nextUrl.searchParams.get("operationId") ?? "",
      request.nextUrl.searchParams.get("itemId") ?? "",
    ),
  );
}
