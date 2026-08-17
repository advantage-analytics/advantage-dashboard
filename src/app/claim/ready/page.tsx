import Link from "next/link";
import { ClaimShell, AsidePanel, CLAIM_BUTTON, CLAIM_LINK } from "@/components/claim/claim-shell";

export const metadata = { title: "Your program is set up" };

/**
 * The auto-approved ending, and the one /claim/review has always pointed at:
 * "a recognized address never sees this page at all; it lands straight in the
 * program."
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
  searchParams: Promise<{ school?: string; email?: string }>;
}) {
  const { school, email } = await searchParams;
  const schoolName = school?.trim() || "Your program";

  return (
    <ClaimShell
      heading={`${schoolName} is yours`}
      sub="We recognised your address on the program's staff list, so there was nothing to check. The workspace is open and video can go in whenever you're ready."
      aside={
        <AsidePanel
          title="What you have"
          items={[
            { text: "75 hours of processed video per program per month" },
            { text: "Free through December 31, 2026" },
            { text: "No hardware to buy, no contract, no cost" },
            { text: "Paid plans begin in January 2027", muted: true },
          ]}
        />
      }
      footer={
        <>
          Set up under{" "}
          <span className="text-[var(--ink-700)]">{email || "your address"}</span>.
          If this program isn&#39;t yours to run,{" "}
          <Link href="/claim/program" className={CLAIM_LINK}>
            tell us
          </Link>{" "}
          and we&#39;ll hand it back.
        </>
      }
    >
      <Link href="/dashboard" className={CLAIM_BUTTON}>
        Go to your program
      </Link>
    </ClaimShell>
  );
}
