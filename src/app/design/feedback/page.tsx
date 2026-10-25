import { notFound } from "next/navigation";
import { FeedbackPreview } from "./feedback-preview";

/**
 * The first-match feedback prompt, for a decision on its shape: the DS dialog
 * (the shipped `FirstMatchFeedbackDialog`) against two sketches on the same
 * fields — a corner card that floats over the page, and a card at the top of
 * Home. The sketches exist only here until one is picked.
 *
 * Reads no data and needs no session. Gated like `/design`: a 404 on the
 * production deployment only.
 */
export default function FeedbackDesignPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <FeedbackPreview />;
}
