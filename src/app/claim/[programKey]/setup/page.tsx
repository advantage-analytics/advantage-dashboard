import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { teamLabel, programSubtitle } from "@/lib/data/programs-server";
import { ClaimShell, AsidePanel } from "@/components/claim/claim-shell";
import { SetupForm } from "@/components/claim/setup-form";

/**
 * F4 / F4.1 — set up the program.
 *
 * The aside states the announced claim UP FRONT. It is the verification, so it
 * should not be a surprise afterwards: everyone else on the recorded staff is
 * told you claimed this, with one click to object. That sentence is the whole
 * reason a stale directory does not become a wrong owner.
 */
export default async function SetupProgramPage({
  params,
}: {
  params: Promise<{ programKey: string }>;
}) {
  const { programKey } = await params;
  const supabase = await createClient();

  // These four columns are readable by anon — the same fields the browser needs
  // for the live inline note. The authoritative check re-reads them server-side
  // on submit.
  const { data: program } = await supabase
    .from("programs")
    .select(
      "school_name, team, division, conference, status, primary_domain, athletics_domains, domain_match_skips_review"
    )
    .eq("program_key", programKey)
    .maybeSingle();

  if (!program) notFound();

  const squad = teamLabel(program.team as string);
  const eyebrow = [
    program.school_name as string,
    squad,
    programSubtitle(program.division as string | null, program.conference as string | null),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ClaimShell
      eyebrow={eyebrow}
      heading={`Set up ${program.school_name} ${squad.toLowerCase()} tennis`}
      aside={
        <AsidePanel
          title="What happens when you do"
          items={[
            { text: "You manage staff, roster and permissions" },
            {
              text: "Everyone else on the recorded staff is told you claimed it, with one click to object",
            },
            {
              text: "Inviting people works immediately; sending video waits only if the claim needs review",
            },
          ]}
        />
      }
    >
      <SetupForm
        programKey={programKey}
        schoolName={program.school_name as string}
        program={{
          school_name: program.school_name as string,
          primary_domain: program.primary_domain as string | null,
          athletics_domains: program.athletics_domains as string[] | null,
          domain_match_skips_review: program.domain_match_skips_review as boolean,
        }}
      />
    </ClaimShell>
  );
}
