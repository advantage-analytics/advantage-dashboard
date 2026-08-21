import { redirect } from "next/navigation";

/**
 * Renamed to Plan in round 4 — "subscription" was the wrong word for a
 * one-time purchase, and it is the word people looked for when they wanted
 * their analysis hours, which now live on Usage. The old path stays for
 * bookmarks and for the Stripe return URL.
 */
export default async function SubscriptionRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  const suffix = query.size > 0 ? `?${query}` : "";
  redirect(`/dashboard/settings/plan${suffix}`);
}
