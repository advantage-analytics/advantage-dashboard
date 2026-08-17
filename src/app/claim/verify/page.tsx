import Link from "next/link";
import { redirect } from "next/navigation";
import { completeClaim } from "@/lib/services/programs/claim-actions";
import { ClaimShell, CLAIM_BUTTON, CLAIM_LINK } from "@/components/claim/claim-shell";

export const metadata = { title: "Setting up your program" };

/**
 * Where the emailed link lands, and where a claim becomes ownership.
 *
 * `/confirm` has already exchanged the code and created the `users` row by the
 * time anyone reaches this, so the session is real and the address is proven.
 * That proof is the whole gate: nothing before this point wrote a single row,
 * which is what stops an anonymous script parking an open claim on all 1,940
 * programs.
 *
 * The claim is identified by the SESSION's email and an httpOnly cookie, never
 * by an id in the URL — there is nothing here to tamper with.
 *
 * Rendered as a Server Component that performs the write. That is unusual, and
 * deliberate: the alternative is a client component firing the action in an
 * effect, which double-fires under StrictMode and turns a "program already
 * claimed" race into the user's problem. The RPC is idempotent for the owner,
 * so a refresh is safe.
 */
export default async function ClaimVerifyPage() {
  const result = await completeClaim();

  if (result.ok) {
    // Every claim reaches a human, so verification always lands on review.
    // F5.1 is that screen — until now it had no inbound route at all.
    redirect(
      `/claim/review?school=${encodeURIComponent(result.schoolName)}` +
        `&program=${encodeURIComponent(result.programKey)}`
    );
  }

  return (
    <ClaimShell
      heading="We couldn't finish setting this up"
      sub={result.error}
    >
      {result.needsRestart ? (
        <>
          <Link href="/claim/program" className={CLAIM_BUTTON}>
            Find your program again
          </Link>
          <p className="mt-4 text-[12px] leading-[1.6] text-[var(--ink-500)]">
            Nothing was created, and no one has been told anything. Picking the
            program again sends a fresh link.
          </p>
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <Link href="/dashboard" className={CLAIM_BUTTON}>
            Go to your account
          </Link>
          <Link href="/claim/program" className={CLAIM_LINK}>
            Choose a different program
          </Link>
        </div>
      )}
    </ClaimShell>
  );
}
