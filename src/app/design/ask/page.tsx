import { notFound } from "next/navigation";
import {
  AskLayoutsPreview,
  type AskLayoutVariant,
} from "./ask-layouts-preview";

/**
 * Three layouts for the personal Ask page, side by side for a decision:
 * where the list of earlier questions lives, and what is left on the right.
 *
 *   ?v=a  chat list on the left, no right rail
 *   ?v=b  chat list on the left, a slim right rail for tags and the limit
 *   ?v=c  the layout as built: everything in the right rail
 *
 * The composer, the answer and the right rail are the real components on
 * fixed inputs; the left chat list is a sketch that exists only here. Reads no
 * data and needs no session.
 *
 * Gated like `/design`: a 404 on the production deployment only.
 */
export default async function AskDesignPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const { v } = await searchParams;
  const variant: AskLayoutVariant = v === "b" || v === "c" ? v : "a";
  return <AskLayoutsPreview variant={variant} />;
}
