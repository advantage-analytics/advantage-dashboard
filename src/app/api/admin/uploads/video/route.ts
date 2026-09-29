import { NextResponse } from "next/server";
import { submitAdminMatchVideo } from "@/lib/services/programs/admin-video-submission";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const result = await submitAdminMatchVideo(
    await request.json().catch(() => null),
  );
  if (result.ok) return NextResponse.json(result);
  // 401 no session, 403 not an admin, 400 a bad request; the body stays
  // `{ ok, message }`, which is all the wizard reads.
  const { status, ...body } = result;
  return NextResponse.json(body, { status });
}
