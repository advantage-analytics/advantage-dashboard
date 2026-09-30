import { adminJson } from "@/lib/admin/uploads/http";
import { submitAdminMatchVideo } from "@/lib/services/programs/admin-video-submission";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return adminJson(
    await submitAdminMatchVideo(await request.json().catch(() => null)),
  );
}
