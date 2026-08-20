import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { teamLabel, divisionLabel } from "@/lib/data/programs-server";
import { ClaimShell, ClaimHeading } from "@/components/claim/claim-shell";
import {
  SetupEmailProvider,
  SetupAside,
  SetupForm,
} from "@/components/claim/setup-form";

export const metadata = { title: "Set up your program" };

/**
 * F4 / F4.1 — set up the program.
 *
 * One screen, two states, and the state is the address: an institutional one
 * gets "what happens when you do", a personal one gets "what waits, and what
 * doesn't". Identical form, identical button, one different micro line — the
 * divergence is in what is held back later, not in how this screen treats the
 * person filling it in.
 *
 * The eyebrow drops the conference the status screen carries. By this point the
 * program is chosen; school, squad and division are enough to confirm which one
 * without re-arguing the case for it.
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
    divisionLabel(program.division as string | null),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <SetupEmailProvider>
      <ClaimShell
        width={1000}
        gap={16}
        asideWidth={340}
        back={`/claim/${programKey}`}
        aside={<SetupAside />}
      >
        <ClaimHeading
          gap={2}
          eyebrow={eyebrow}
          title={`Set up ${program.school_name} ${squad.toLowerCase()} tennis`}
          titlePadTop={6}
        />
        <SetupForm
          programKey={programKey}
          program={{
            school_name: program.school_name as string,
            primary_domain: program.primary_domain as string | null,
            athletics_domains: program.athletics_domains as string[] | null,
            domain_match_skips_review: program.domain_match_skips_review as boolean,
          }}
        />
      </ClaimShell>
    </SetupEmailProvider>
  );
}
