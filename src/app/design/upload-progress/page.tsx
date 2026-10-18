import { notFound } from "next/navigation";
import { UploadProgressPreview } from "./upload-progress-preview";

/**
 * The upload wizard's final screen while the video is prepared in this tab —
 * cut, converted or compressed — reachable without a session or a real upload.
 * Renders the real `UploadMatchSuccess` from fixed upload states.
 *
 * Gated like `/design`: a 404 on the production deployment only.
 */
export default function UploadProgressDesignPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <UploadProgressPreview />;
}
