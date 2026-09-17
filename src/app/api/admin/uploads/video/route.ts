import { NextResponse } from "next/server";
import { submitAdminMatchVideo } from "@/lib/services/programs/admin-video-submission";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const result = await submitAdminMatchVideo(
    await request.json().catch(() => null),
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
