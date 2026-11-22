import { notFound } from "next/navigation";
import { FullRequestsPreview } from "./full-requests-preview";

/**
 * Admin › Requests, full screen, with the HZCU request open in its drawer —
 * the shipped header and `RequestsPageContent` on fixture rows. Reads no data
 * and needs no session. Gated like `/design`: a 404 on production only.
 */
export default function FullRequestsDesignPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <FullRequestsPreview />;
}
