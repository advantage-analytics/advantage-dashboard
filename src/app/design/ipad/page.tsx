import { notFound } from "next/navigation";
import { IpadPreview } from "./ipad-preview";

/**
 * The iPad touch adaptations, side by side with what an iPad gets today.
 *
 * A proposal under review: the "With touch fixes" frames simulate the touch
 * rules with preview-scoped CSS and press-and-hold wrappers, so nothing in
 * the shipped components changes until the direction is agreed. Open it on a
 * desktop to compare, and on a real iPad to feel the gestures.
 *
 * Gated like `/design`: a 404 on the production deployment only.
 */
export default function IpadDesignPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <IpadPreview />;
}
