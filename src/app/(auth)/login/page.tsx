import { LoginForm } from "@/components/auth/login-form";
import { safeNext } from "@/lib/auth/safe-next";

/**
 * Reads `?next=` once and clamps it before the form ever sees it.
 *
 * An invite link sends a signed-out user here so they can land back on
 * `/join/<token>` afterwards, so the destination is attacker-controlled and
 * has to go through `safeNext`. Only a path travels — never the invitee's
 * email, which would let anyone with the link learn who was invited.
 *
 * A Server Component reading `searchParams`, not a client page reading
 * `useSearchParams()`. The client version needed a `<Suspense>` boundary, and
 * Next prerenders the boundary's fallback: the busiest signed-out route was
 * shipping an empty panel and drawing its form only after hydration. Awaiting
 * the params makes the route dynamic, and the render is pure JSX with no I/O,
 * so that buys a full first paint for a per-request render of nothing.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { next } = await searchParams;
  return <LoginForm next={safeNext(typeof next === "string" ? next : null)} />;
}
