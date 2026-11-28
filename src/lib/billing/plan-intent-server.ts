import { cookies } from "next/headers";

import {
  PLAN_INTENT_COOKIE,
  PLAN_INTENT_MAX_AGE_SECONDS,
  decodePlanIntent,
  encodePlanIntent,
  planIntentFromPath,
  planIntentHref,
} from "./plan-intent";
import { plansOnSale } from "./plans";

/**
 * The cookie half of a plan picked on the landing site — server only (it
 * reads and writes cookies, so a Server Action or a Route Handler).
 *
 * `?next=` carries the Plan page's path through the confirmation email, but a
 * new account's first dashboard request is sent to `/onboarding` with nothing
 * attached. So the sign-in that follows the email remembers the intent here,
 * and onboarding takes it back when it finishes.
 */

/** Remember the plan `next` names, when it is the Plan page with one. */
export async function rememberPlanIntent(next: string): Promise<void> {
  const intent = planIntentFromPath(next);
  if (!intent) return;
  (await cookies()).set(PLAN_INTENT_COOKIE, encodePlanIntent(intent), {
    path: "/",
    maxAge: PLAN_INTENT_MAX_AGE_SECONDS,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}

/**
 * Where a remembered plan lands — Settings › Plan with its two values — or
 * null with none. Read once: the cookie is cleared either way, and a value
 * that is not a plan on sale is dropped silently.
 */
export async function takePlanIntentHref(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(PLAN_INTENT_COOKIE)?.value;
  if (raw === undefined) return null;
  store.set(PLAN_INTENT_COOKIE, "", { path: "/", maxAge: 0 });
  const intent = decodePlanIntent(raw);
  return intent && plansOnSale() ? planIntentHref(intent) : null;
}
