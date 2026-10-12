import { notFound } from "next/navigation";
import { FileStepPreview } from "./file-step-preview";

/**
 * The upload wizard's file step, in every state the video path can show,
 * reachable without a session or a real video.
 *
 * The wizard has no URL per step and its file states need a recording that
 * passes, one that is flagged and one that is refused — none of which a
 * screenshot harness can produce by navigating. This renders the real
 * `FileStepContent` from the real validator's verdicts on fixed probes.
 * `?dialog=open` shows the requirements dialog open instead.
 *
 * Gated like `/design`: a 404 on the production deployment only.
 */
export default async function FileStepDesignPage({
  searchParams,
}: {
  searchParams: Promise<{ dialog?: string }>;
}) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const { dialog } = await searchParams;
  return <FileStepPreview dialogOpen={dialog === "open"} />;
}
