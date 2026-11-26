import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getProgramPublicStatus,
  programSubtitle,
  teamLabel,
} from "@/lib/data/programs-server";
import { ClaimShell } from "@/components/claim/claim-shell";
import { PilotTermsForm } from "@/components/claim/pilot-terms-form";
import { termsCopyFor, verifyHref } from "@/lib/services/programs/pilot-terms";
import {
  hasAcceptedTermsForUser,
  resolveClaimTerms,
} from "@/lib/services/programs/pilot-terms-server";
import { quotaTierFor } from "@/lib/services/splitstep/quota";
import { termsNamingCopy } from "@/lib/billing/claim-copy";
import { plansHaveBegun } from "@/lib/billing/plans";

/**
 * "Pilot terms" before January 1, 2027 and "Team terms" from it. The date
 * alone: the tab title is drawn before the session and the pending claim are
 * read, and "Team terms" is still a true name for what a program on a
 * running pilot is shown (its heading says which).
 */
export function generateMetadata() {
  return { title: termsNamingCopy(plansHaveBegun()).pageTitle };
}

/**
 * Pilot terms, college flow (design frames A, A.1, C), between the emailed
 * link and the claim becoming ownership.
 *
 * Reached only by redirect from `/claim/verify`, which sends a signed-in
 * coach here when they hold no acceptance at the current version, carrying
 * the signed-in link's `?token=` when there is one. Accepting records the
 * acceptance and sends them back to `/claim/verify` with that same token, and
 * only that second pass calls `completeClaim` / `completeClaimWithToken`.
 *
 * The program key in the path picks the eyebrow and nothing else. Which claim
 * finishes is still decided in `/claim/verify` by the session and the token,
 * exactly as before, and the acceptance names no program, so a swapped key
 * changes a label and cannot move a claim.
 *
 * Which terms are shown (the pilot's or the team terms, `resolveClaimTerms`)
 * follows the program the pending claim is FOR, found from the session and
 * the token as verify finds it, and only falls back to the path's key when
 * there is no live claim. The form passes that key back and the accept
 * action calls the same resolver with the same three inputs, so the two
 * always agree and a swapped key cannot swap the terms of a live claim.
 *
 * Every exit that is not "show the terms" goes back through verify, which
 * already owns the wording for each ending: no session (it reports
 * `no-session` / `sign-in-first`) and an acceptance already on file (it
 * finishes the claim), unless `?refused=1` says verify has just been turned
 * away by the database. No back arrow: behind this screen is the email link,
 * the same reason F2 has none.
 */
export default async function ClaimPilotTermsPage({
  params,
  searchParams,
}: {
  params: Promise<{ programKey: string }>;
  searchParams: Promise<{ token?: string | string[]; refused?: string }>;
}) {
  const [{ programKey }, query] = await Promise.all([params, searchParams]);
  const token = typeof query.token === "string" ? query.token : null;
  // Verify's report that the database refused the claim for want of an
  // acceptance (frame C). The app may think the coach has accepted, so this
  // screen must not bounce straight back, or the two redirect each other.
  const refused = query.refused === "1";
  const verify = verifyHref(token);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(verify);
  const { version } = await resolveClaimTerms(supabase, user, {
    token,
    programKey,
  });
  if (!refused && (await hasAcceptedTermsForUser(user.id, version)))
    redirect(verify);

  const program = await getProgramPublicStatus(supabase, programKey);
  if (!program) notFound();

  const eyebrow = [
    program.schoolName,
    teamLabel(program.team),
    programSubtitle(program.division, program.conference),
  ]
    .filter(Boolean)
    .join(" · ");

  const copy = termsCopyFor(version, {
    flow: "college",
    accountType: quotaTierFor({ kind: "team", orgType: "college" }),
  });

  return (
    <ClaimShell width={720} gap={20}>
      <PilotTermsForm
        flow="college"
        eyebrow={eyebrow}
        copy={copy}
        version={version}
        token={token}
        programKey={programKey}
        refused={refused}
      />
    </ClaimShell>
  );
}
