import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  teamLabel,
  programSubtitle,
} from "@/lib/data/programs-server";
import { ClaimShell, ClaimHeading } from "@/components/claim/claim-shell";
import { SetupAside, SetupForm } from "@/components/claim/setup-form";

export const metadata = { title: "Set up your program" };

/**
 * F4 / F4.1, as 4.3b c redraws it — set up the program.
 *
 * One screen, one card. The address still decides what happens later — an
 * institutional one settles straight away, a personal one reaches a person —
 * but the panel no longer rewrites itself as the address is typed: "Yours
 * now" and "After we confirm" are true of every address, and the inline note
 * under the field is where the difference belongs.
 *
 * The title names the school, so the eyebrow carries only the qualifiers —
 * the same split as the status and referral screens either side of this one,
 * and the same 840/300 proportions.
 */
export default async function SetupProgramPage({
  params,
}: {
  params: Promise<{ programKey: string }>;
}) {
  const { programKey } = await params;
  const supabase = await createClient();

  // These columns are readable by anon — the same fields the browser needs
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
  const qualifiers = [
    squad,
    programSubtitle(
      program.division as string | null,
      program.conference as string | null
    ),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ClaimShell
      width={840}
      gap={16}
      asideWidth={300}
      back={`/claim/${programKey}`}
      aside={<SetupAside />}
    >
      <ClaimHeading
        gap={2}
        eyebrow={qualifiers}
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
  );
}
