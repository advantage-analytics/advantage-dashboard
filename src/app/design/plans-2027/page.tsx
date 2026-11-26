import { notFound } from "next/navigation";
import { Plans2027Preview } from "./plans-2027-preview";

export const metadata = { title: "Plans 2027 preview" };

/**
 * The 2027 plan surfaces on fixtures, reachable without a session, a
 * subscription or a video: Settings › Plan for each plan, the one checkout
 * dialog in each of its scenes, and the upload wizard's file step with its
 * hours note.
 *
 * Everything real is gated on `plansOnSale()` and on the viewer's own plan,
 * so none of it can be opened before January without this. The components
 * are the shipped ones; only their props are fixed (the upgrade's figures
 * come from the real `quoteUpgrade()` on fixed dates). `?state=<id>` picks
 * one surface; with none, the page lists them.
 *
 * Gated like `/design`: a 404 on the production deployment only.
 */
export default async function Plans2027DesignPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const { state } = await searchParams;
  return <Plans2027Preview state={typeof state === "string" ? state : null} />;
}
