import { NextRequest, NextResponse } from "next/server";
import {
  getAdminMatchFileStatus,
  submitAdminMatchFile,
} from "@/lib/services/programs/admin-file-submission";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const result = await submitAdminMatchFile(await request.formData());
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Submission response was interrupted. Check this operation before retrying with the same file.",
      },
      { status: 500 },
    );
  }
}
export async function GET(request: NextRequest) {
  const result = await getAdminMatchFileStatus(
    request.nextUrl.searchParams.get("operationId") ?? "",
    request.nextUrl.searchParams.get("itemId") ?? "",
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
