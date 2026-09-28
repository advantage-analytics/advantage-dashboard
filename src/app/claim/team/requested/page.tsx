import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CLAIM_BUTTON,
  ClaimActions,
  ClaimHeading,
  ClaimShell,
} from "@/components/claim/claim-shell";
import { TYPE_LABEL } from "@/components/claim/existing-team-matches";
import { isCustomOrgType } from "@/lib/services/programs/custom-org";

export const metadata = { title: "Request sent" };

/**
 * After "Ask to join" on 7.2: the coach's request to join an existing custom
 * org is on file and its owner has been told.
 *
 * Reached from `askToJoinExistingTeam`'s redirect with `?team=<program id>`.
 * The id alone proves nothing — a custom org is hidden from non-members, so
 * the page shows a team's name only when an OPEN `invite_request` from this
 * session's own address exists for it. Anyone else, or a stale link, goes
 * back to choosing a type rather than learning which id maps to which name.
 *
 * No back: the request is submitted, like F5.1, so the only ways out are
 * forward — the one button and the ✕ both lead to the dashboard. Nothing
 * here writes the pending-team cookie: no team is being set up.
 */
export default async function TeamRequestedPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const { team } = await searchParams;
  if (!team) redirect("/claim/team/type");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.trim().toLowerCase();
  if (!user || !email) redirect("/login");

  const admin = createAdminClient();
  // Neither query depends on the other's result — both only need `team` (and
  // the request check also needs `email`) — so they go out together.
  const [{ data: request }, { data: program }] = await Promise.all([
    admin
      .from("program_requests")
      .select("id")
      .eq("kind", "invite_request")
      .eq("status", "open")
      .eq("program_id", team)
      .eq("email", email)
      .limit(1)
      .maybeSingle(),
    admin
      .from("programs")
      .select("school_name, org_type")
      .eq("id", team)
      .maybeSingle(),
  ]);
  if (!request || !program || !isCustomOrgType(program.org_type)) {
    redirect("/claim/team/type");
  }

  const name = program.school_name as string;
  // "Something else" is the type screen's label, not a fact about the team.
  const typeLabel =
    program.org_type === "other" ? null : TYPE_LABEL[program.org_type].eyebrow;

  return (
    <ClaimShell width={720} gap={20} exitHref="/dashboard">
      <ClaimHeading
        gap={2}
        eyebrow={[name, typeLabel].filter(Boolean).join(" · ")}
        title={`We've asked ${name}'s owner to add you`}
        titlePadTop={8}
        body={`Your request is with the person who runs ${name} on Advantage. Nothing is set up for you until they act on it — when they approve, an invitation lands at ${email} and the team joins your workspace menu.`}
        bodyMax="58ch"
      />
      <ClaimActions>
        <Link href="/dashboard" className={CLAIM_BUTTON}>
          Go to your dashboard
        </Link>
      </ClaimActions>
    </ClaimShell>
  );
}
