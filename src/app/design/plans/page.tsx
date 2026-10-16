import { notFound } from "next/navigation";
import { PlansPreview } from "./plans-preview";

/**
 * Settings › Plan for a personal workspace, in two stages: now, during the
 * free pilot (2 hours a month until January 1), with January's plans at list
 * price; and from January 2027, on a paid plan with hours, credits and
 * upgrades. Team plans stay off the page until the fall pilot ends.
 *
 * A mock with fixed numbers, not the live page — nothing here reads a
 * workspace or charges anything. The prices are the draft ones on the landing
 * site's /design/pricing. Gated like `/design`: a 404 on production only.
 */
export default function PlansDesignPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <PlansPreview />;
}
