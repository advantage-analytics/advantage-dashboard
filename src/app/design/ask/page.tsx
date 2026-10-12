import { notFound } from "next/navigation";
import { AskLayoutsPreview, type AskRailVariant } from "./ask-layouts-preview";

/**
 * The personal Ask page as a chat: earlier questions in a left rail, the
 * player's prompts on the right of the thread, answers on the left. Three
 * ways to organise the rail, for a decision:
 *
 *   ?v=1  by month — one line per question, date at the edge
 *   ?v=2  with context — two lines: the question, then what it was about
 *   ?v=3  by opponent — grouped under who the question was about
 *
 * `&rail=closed` shows the rail collapsed. The composer and the answer are
 * the real components on fixed inputs; the rail and the prompt bubble are
 * sketches that exist only here. Reads no data and needs no session.
 *
 * Gated like `/design`: a 404 on the production deployment only.
 */
export default async function AskDesignPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string; rail?: string }>;
}) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const { v, rail } = await searchParams;
  const variant: AskRailVariant = v === "2" || v === "3" ? v : "1";
  return <AskLayoutsPreview variant={variant} railClosed={rail === "closed"} />;
}
