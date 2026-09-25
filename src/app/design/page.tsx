import { notFound } from "next/navigation";
import { DesignPreview } from "./design-preview";

/**
 * A preview surface for UI under review, reachable without signing in.
 *
 * Shows components with fixed inputs rather than a real workspace, so it reads
 * no data and needs no session. A 404 on the production deployment only:
 * Vercel previews build with `NODE_ENV=production` too, and a preview is where
 * a design gets looked at, so the gate is `VERCEL_ENV` rather than the build
 * mode `/wizard-reproduction` uses.
 */
export default function DesignPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <DesignPreview />;
}
