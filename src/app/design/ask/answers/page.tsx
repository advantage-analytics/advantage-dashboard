import { notFound } from "next/navigation";
import {
  AskAnswersPreview,
  type AnswerByline,
  type AnswerDesign,
} from "./answers-preview";

/**
 * Designs for an Ask answer, for a decision: how the answer is laid out, how
 * (or whether) it is signed, and which chart blocks it may carry.
 *
 *   ?d=1  statement — figures with their comparison, one paragraph
 *   ?d=2  lead figure — one number carries it, supporting stats beside
 *   ?d=3  evidence table — the numbers as a small table
 *   ?d=4  visual first — a chart block, the prose behind a disclosure
 *
 *   ?by=none | footer | mark | current — the "Advantage Intelligence" line
 *
 * The prompt and the source rows are the real components; the answers and the
 * chart blocks are sketches on fixed numbers. Reads no data, needs no session.
 *
 * Gated like `/design`: a 404 on the production deployment only.
 */
export default async function AskAnswersDesignPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; by?: string }>;
}) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const { d, by } = await searchParams;
  const design: AnswerDesign = d === "2" || d === "3" || d === "4" ? d : "1";
  const byline: AnswerByline =
    by === "footer" || by === "mark" || by === "current" ? by : "none";
  return <AskAnswersPreview design={design} byline={byline} />;
}
