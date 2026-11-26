import { SignUpForm } from "@/components/auth/sign-up-form";
import { SignedInGate } from "@/components/auth/signed-in-card";
import { safeNext } from "@/lib/auth/safe-next";
import { parsePlanIntent, planIntentHref } from "@/lib/billing/plan-intent";
import { plansOnSale } from "@/lib/billing/plans";
import { joinProgramNameForNext } from "@/lib/services/programs/join-state-server";

export const metadata = { title: "Create account" };

/**
 * Reads `?next=` once and clamps it before the form ever sees it — the same
 * shape as `/login`, and for the same reason.
 *
 * A join link sends a signed-out visitor here to make an account, and `next`
 * is how the confirmation mail brings them back to `/join/<token>` instead of
 * leaving a brand-new account on the dashboard, not on the team it was made
 * to join. When `next` is a join link the form's header names the team; any
 * other destination renders the ordinary form with no extra read. A browser
 * that is already signed in gets `SignedInGate`'s card instead of the form.
 *
 * `?plan=<id>&period=<p>` is the landing site's "Choose Coach": both values
 * are checked against the plan module (`parsePlanIntent`) and become a `next`
 * of Settings › Plan with the same two values, where the checkout dialog
 * opens on them. `plan=free`, an unknown plan or a missing period is dropped
 * silently and the account lands on Home as it always did.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { next: raw, plan, period } = await searchParams;
  const requested = typeof raw === "string" ? raw : null;
  // A plan picked on the landing site: an explicit `next` (a join link) wins,
  // and before plans are on sale there is no checkout to land on.
  const intent =
    requested === null && plansOnSale() ? parsePlanIntent(plan, period) : null;
  const next = safeNext(intent ? planIntentHref(intent) : requested);
  const joinProgram = await joinProgramNameForNext(next);
  return (
    <SignedInGate mode="sign-up" next={next}>
      <SignUpForm next={next} joinProgram={joinProgram} />
    </SignedInGate>
  );
}
