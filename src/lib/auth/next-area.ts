import { safeNext } from "@/lib/auth/safe-next";

/**
 * Where a sign-in is headed, as a coarse area for `login_completed` and
 * `login_failed`.
 *
 * posthog-js runs with `mask_personal_data_properties`, which strips the
 * query string from every captured URL, so whether `/login` arrived with a
 * `?next=` is invisible on its own — a labeller bounced to the personal
 * dashboard after signing in (2026-11-25/26) could not be told apart from
 * one who opened `/login` bare. This is the one fact that answers it.
 *
 * Only the first path segment, mapped to a closed set. Never the path, its
 * query or its hash: a join link's `next` carries the invite token, and a
 * consent link the authorization id.
 */
export type NextArea =
  | "dashboard"
  | "label"
  | "join"
  | "claim"
  | "admin"
  | "onboarding"
  | "oauth"
  | "other";

export interface LoginDestination {
  next_area: NextArea;
  /** A destination other than the `/dashboard` fallback arrived. */
  has_next: boolean;
}

const AREAS: ReadonlySet<NextArea> = new Set<NextArea>([
  "dashboard",
  "label",
  "join",
  "claim",
  "admin",
  "onboarding",
  "oauth",
]);

/** Fallback `safeNext` lands on when nothing usable arrived. */
const FALLBACK = safeNext(null);

/**
 * @param next The `next` the sign-in will follow — clamped again here, so
 *   a raw query value is as safe to pass as an already-clamped one.
 */
export function loginDestination(
  next: string | null | undefined,
): LoginDestination {
  const destination = safeNext(next ?? null);
  const segment =
    new URL(destination, "https://next.invalid").pathname.split("/")[1] ?? "";
  const area = AREAS.has(segment as NextArea) ? (segment as NextArea) : "other";
  return { next_area: area, has_next: destination !== FALLBACK };
}
