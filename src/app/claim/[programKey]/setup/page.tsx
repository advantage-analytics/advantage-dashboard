import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { teamLabel, programSubtitle } from "@/lib/data/programs-server";
import { ClaimShell, AsidePanel } from "@/components/claim/claim-shell";
import { SetupForm } from "@/components/claim/setup-form";

/**
 * F4 / F4.1 — set up the program.
 *
 * The aside used to promise that everyone else on the recorded staff would be
 * told, with one click to object. That announcement was cut — mailing scraped
 * addresses on every claim is unsolicited bulk mail to people who never signed
 * up — so the sentence was a promise the system does not keep, made at the
 * moment a coach commits. What replaced it is what actually happens: an address
 * already on the staff list settles immediately, and anything else reaches a
 * person.
 *
 * The aside deliberately does NOT say whether THIS address is on that list.
 * Telling the browser would turn the form into an enumeration oracle over
 * 3,117 real people's work addresses.
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
              text: "An address already on the program's staff list settles straight away",
            },
            {
              text: "Anything else reaches a person, usually inside a day",
            },
            {
              text: "Inviting people works immediately; only sending video waits on that check",
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
