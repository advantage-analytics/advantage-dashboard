import Link from "next/link";
import { teamLabel } from "@/lib/data/programs-server";
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
 * program" opens the dashboard in the program rather than in Personal.
 */
export default async function ClaimReadyPage({
  searchParams,
}: {
  searchParams: Promise<{ school?: string; team?: string; email?: string }>;
}) {
  const { school, team, email } = await searchParams;
  const schoolName = school?.trim() || "Your program";
  const eyebrow = [school?.trim(), team ? teamLabel(team) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <ClaimShell
      width={840}
      gap={16}
      exitHref="/dashboard"
      exitLabel="Go to the program"
      aside={
        <AsidePanel
          title="What you have"
          items={[
            "75 hours of processed video per program per month",
            "Free through December 31, 2026",
            "No hardware to buy, no contract, no cost",
            "Paid plans begin in January 2027",
          ]}
        />
      }
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
          <Link href="/dashboard" className={CLAIM_BUTTON}>
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
