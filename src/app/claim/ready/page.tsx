import Link from "next/link";
import { teamLabel } from "@/lib/data/programs-server";
import { claimOnPlans, claimReadyItems } from "@/lib/billing/claim-copy";
import { programPilotIsRunning } from "@/lib/services/programs/pilot-terms-server";
import { createClient } from "@/lib/supabase/server";
import {
  ClaimShell,
  ClaimHeading,
  AsidePanel,
  ClaimActions,
  CLAIM_BUTTON,
  CLAIM_LINK,
  CLAIM_MICRO,
} from "@/components/claim/claim-shell";

export const metadata = { title: "Your program is set up" };

/**
 * The auto-approved ending, and the one F5.1 has always pointed at: "a
 * recognized address never sees this page at all; it lands straight on F6."
 *
 * Reached only when the claimed address is a recorded non-freemail contact for
 * this exact program — the person named on the team's staff page. Nothing is
 * pending, so this screen sets no expectation of a wait and mentions no
 * reviewer.
 *
 * The workspace cookie is already set by the time this renders, so "Go to your
 * program" (and ✕) lead to the coach intake (5.2, `/claim/team/about`), which
 * reads that cookie to find the program and then opens the team dashboard.
 *
 * "What you have" is the pilot's list before January 1, 2027 and, from it,
 * for a program whose pilot is running; otherwise it is what a team with no
 * plan has. The program is the `?program=` id verify put in the URL, read
 * with the visitor's own session, so an id that is not theirs to read (or
 * none at all) simply reads as a program on no pilot.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClaimReadyPage({
  searchParams,
}: {
  searchParams: Promise<{
    school?: string;
    team?: string;
    email?: string;
    program?: string;
  }>;
}) {
  const { school, team, email, program } = await searchParams;
  const pilotRunning =
    typeof program === "string" && UUID.test(program)
      ? await programPilotIsRunning(await createClient(), {
          programId: program,
        })
      : false;
  const items = claimReadyItems(claimOnPlans({ pilotRunning }));
  const schoolName = school?.trim() || "Your program";
  const eyebrow = [school?.trim(), team ? teamLabel(team) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <ClaimShell
      width={840}
      gap={16}
      exitHref="/claim/team/about"
      exitLabel="Go to the program"
      aside={<AsidePanel title="What you have" items={[...items]} />}
    >
      <ClaimHeading
        gap={2}
        eyebrow={eyebrow || undefined}
        title={`${schoolName} is yours`}
        titlePadTop={8}
      />
      <p className="text-body max-w-[56ch]">
        We recognised your address on the program&#39;s staff list, so there was
        nothing to check. The workspace is open and video can go in whenever
        you&#39;re ready.
      </p>
      <div className="pt-1">
        <ClaimActions>
          <Link href="/claim/team/about" className={CLAIM_BUTTON}>
            Go to your program
          </Link>
        </ClaimActions>
      </div>
      <span className={CLAIM_MICRO}>
        Set up under{" "}
        <span className="mono text-[var(--ink-700)]">
          {email || "your address"}
        </span>
        . If this program isn&#39;t yours to run,{" "}
        <Link href="/claim/program" className={CLAIM_LINK}>
          tell us
        </Link>{" "}
        and we&#39;ll hand it back.
      </span>
    </ClaimShell>
  );
}
