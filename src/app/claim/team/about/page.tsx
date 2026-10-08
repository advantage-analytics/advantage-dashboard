import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WORKSPACE_COOKIE } from "@/lib/workspace/workspace-cookie";
import { teamLabel } from "@/lib/data/programs-server";
import { ClaimShell, ClaimHeading } from "@/components/claim/claim-shell";
import { ProgramIntakeForm } from "@/components/claim/program-intake-form";

export const metadata = { title: "About your program" };

/**
 * Screen 5.2 — the coach's intake, asked once, right after the team exists.
 *
 * Both ways a coach finishes setting up land here: `createCustomTeam` (7.2)
 * and the auto-approved `/claim/ready` ending. Each has already set the
 * workspace cookie to the new program, so the cookie is how this screen knows
 * which program it is asking about — there is no id in the URL to tamper with.
 * A pending-review claim (`/claim/review`) has no program yet and never
 * reaches this screen.
 *
 * The cookie is a pointer, not a credential. The page re-checks that the
 * caller OWNS that program with their own client, and anyone else — a coach,
 * staff, a stale cookie, the personal workspace — is sent to the team
 * dashboard rather than shown a form the RPC would refuse anyway. The owner
 * check here is courtesy; `set_program_intake` is the gate.
 *
 * No back: the team already exists behind this screen, so there is nothing to
 * go back to. ✕ and Skip both lead into the team, because every answer here is
 * optional and the one thing a coach must not lose is the way in.
 */
export default async function ProgramIntakePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The layout already turned a signed-out visitor around; this is for the id.
  if (!user) redirect("/login");

  const programId = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  if (!programId) redirect("/dashboard/team");

  // Independent reads keyed on the same programId — the owner check doesn't
  // need the program row, and the program row doesn't need the membership
  // check — so they overlap rather than paying for two round-trips in series.
  const [{ data: membership }, { data: program }] = await Promise.all([
    supabase
      .from("program_members")
      .select("role")
      .eq("program_id", programId)
      .eq("user_id", user.id)
      .eq("role", "owner")
      .maybeSingle(),
    supabase
      .from("programs")
      .select("school_name, team")
      .eq("id", programId)
      .maybeSingle(),
  ]);
  if (!membership || !program) redirect("/dashboard/team");

  // A custom team created before setup asked has no squad, so its eyebrow
  // is the name alone; one that answered reads "Riverside · Co-ed".
  const eyebrow = [
    program.school_name,
    program.team ? teamLabel(program.team) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ClaimShell
      width={720}
      gap={24}
      exitHref="/dashboard/team"
      exitLabel="Go to my team"
    >
      <ClaimHeading
        gap={2}
        eyebrow={eyebrow || undefined}
        title="A few things about your program"
        titlePadTop={8}
        body="Rough numbers are fine. They help us plan for teams like yours — nothing here changes your plan."
        bodyMax="58ch"
      />
      <ProgramIntakeForm programId={programId} />
    </ClaimShell>
  );
}
