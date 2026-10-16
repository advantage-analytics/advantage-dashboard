import { notFound } from "next/navigation";
import { PlansPreview } from "./plans-preview";

/**
 * Settings › Plan as it would read once paid plans begin in January 2027:
 * the plan you're on, this month's hours, switching plans and buying credits.
 *
 * A mock with fixed numbers, not the live page — nothing here reads a
 * workspace or charges anything. The prices are the draft ones on the landing
 * site's /design/pricing. Gated like `/design`: a 404 on production only.
 */
export default function PlansDesignPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <PlansPreview />;
}
