import { notFound } from "next/navigation";
import { AskPolishPreview } from "./polish-preview";

/**
 * Two parts of a finished Ask answer, for a decision:
 *
 *   Footer — the signature and the thumbs, before and after the thumbs moved
 *   onto the signature's line. "After" is the shipped `AskFeedbackControl`;
 *   "before" is a copy of the old markup that exists only here.
 *
 *   Points — the list "Show me" opens over one match. The first sheet is the
 *   shipped `AskPointList`; the four after it are sketches on the same
 *   points, kept here until one is picked.
 *
 * Reads no data and needs no session. Gated like `/design`: a 404 on the
 * production deployment only.
 */
export default function AskPolishDesignPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <AskPolishPreview />;
}
