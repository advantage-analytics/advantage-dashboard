import Link from "next/link";
import { Mail } from "lucide-react";
import { ClaimShell, ClaimHeading, CLAIM_LINK } from "@/components/claim/claim-shell";
import { ResendTimer } from "@/components/claim/resend-timer";

export const metadata = { title: "Check your email" };

/**
 * F5 — confirm the address.
 *
 * One gate, one link, and the narrowest screen in the flow: 440px, because
 * there is nothing to do here and a wide page would imply there was. The
 * address is spelled out so a typo is caught here rather than in a support
 * thread, and there is no progress bar and no estimate — the link either
 * arrives or it is resent.
 */
export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; program?: string }>;
}) {
  const { to, program } = await searchParams;
  const email = to?.trim() || "your address";
  const programKey = program?.trim() ?? "";
  const backHref = program ? `/claim/${program}/setup` : "/claim/program";

  return (
    <ClaimShell width={440} gap={16} back={backHref}>
      <Mail
        className="size-5 text-[var(--ink-700)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />

      <ClaimHeading
        gap={6}
        title="Check your email"
        body={
          <>
            We sent a link to{" "}
            <span className="mono text-[var(--ink-900)]">{email}</span>. Open it
            and the program is yours.
          </>
        }
        bodyMax="44ch"
      />

      {/* The two things you can do about a link that hasn't arrived, on one
          line above a rule — not stacked as though either were a next step. */}
      <div className="flex w-full flex-wrap items-center gap-4 border-t border-[var(--border-hairline)] pt-3.5">
        <ResendTimer email={email} programKey={programKey} />
        <Link href={backHref} className={CLAIM_LINK}>
          Use a different address
        </Link>
      </div>
    </ClaimShell>
  );
}
