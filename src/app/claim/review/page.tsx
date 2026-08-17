import Link from "next/link";
import { ClaimShell, AsidePanel, CLAIM_BUTTON } from "@/components/claim/claim-shell";

export const metadata = { title: "Claim under review" };

/**
 * F5.1 — claim under review.
 *
 * A recognized address never sees this page at all; it lands straight in the
 * program. This exists so the wait has a shape: what works, what doesn't, and
 * no clock. The workspace opens either way — only sending video waits, because
 * that is the one capability that spends the vendor budget and cannot be taken
 * back.
 */
export default async function ClaimUnderReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ school?: string; email?: string }>;
}) {
  const { school, email } = await searchParams;
  const schoolName = school?.trim() || "your school";

  return (
    <ClaimShell
      heading={`We're confirming this with ${schoolName}`}
      sub="Your address isn't on the recorded staff list, so a person checks it. You can set the program up in the meantime."
      aside={
        <AsidePanel
          title="What waits, and what doesn't"
          items={[
            { text: "Invite staff and players — now" },
            { text: "Build the roster and set permissions — now" },
            { text: "Sending video — paused until we confirm", muted: true },
          ]}
        />
      }
      footer={
        email ? (
          <>
            We&#39;ll email <span className="text-[var(--ink-700)]">{email}</span>{" "}
            either way.
          </>
        ) : (
          <>We&#39;ll email you either way.</>
        )
      }
    >
      <Link href="/dashboard" className={CLAIM_BUTTON}>
        Go to the program
      </Link>
    </ClaimShell>
  );
}
