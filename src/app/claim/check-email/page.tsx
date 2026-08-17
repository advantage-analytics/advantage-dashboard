import Link from "next/link";
import { ClaimShell, CLAIM_LINK } from "@/components/claim/claim-shell";
import { ResendTimer } from "@/components/claim/resend-timer";

export const metadata = { title: "Check your email" };

/**
 * F5 — confirm the address.
 *
 * One gate, one link. The address is spelled out so a typo is caught here
 * rather than in a support thread, and there is no progress bar or estimate:
 * the link either arrives or it is resent.
 */
export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; program?: string }>;
}) {
  const { to, program } = await searchParams;
  const email = to?.trim() || "your address";

  return (
    <ClaimShell
      heading="Check your email"
      sub={undefined}
      footer={
        <>
          Nothing has been sent to your program and no video is being analyzed
          until you open it.
        </>
      }
    >
      <p className="text-[13px] leading-[1.6] text-[var(--ink-600)]">
        We sent a link to{" "}
        <span className="text-[var(--ink-900)]">{email}</span>. Open it and the
        program is yours.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        <ResendTimer email={email} />
        <Link
          href={program ? `/claim/${program}/setup` : "/claim/program"}
          className={CLAIM_LINK}
        >
          Use a different address
        </Link>
      </div>
    </ClaimShell>
  );
}
