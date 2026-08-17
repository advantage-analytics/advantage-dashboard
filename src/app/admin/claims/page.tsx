import { createAdminClient } from "@/lib/supabase/admin";
import { ClaimRow, RequestRow } from "@/components/admin/review-rows";

export const metadata = { title: "Review queue" };
export const dynamic = "force-dynamic";

/**
 * The review queue.
 *
 * This replaced the spec's emailed approve/reject links, and it replaced the
 * announced claim. The announcement was going to mail every scraped contact on
 * a program whenever somebody claimed it — unsolicited mail to people who never
 * signed up, which reads like phishing and burns a sending domain. With one
 * person reviewing every claim, that defence is not needed: the spec's own
 * estimate is 5–15 decisions for the whole pilot.
 *
 * So a domain match no longer approves anything by itself. It records why a
 * claim is low risk; `staff_page_url` is one click away for the rest.
 */
export default async function ReviewQueuePage() {
  const db = createAdminClient();

  const [{ data: claims }, { data: requests }] = await Promise.all([
    db
      .from("program_claims")
      .select(
        "id, claimed_email, claimant_name, claimant_role, domain_matched, skips_manual_review, match_reason, status, created_at, programs(school_name, team, division, state, staff_page_url, review_reasons)"
      )
      .in("status", ["pending_review", "objection_window", "objected"])
      .order("created_at", { ascending: true }),
    db
      .from("program_requests")
      .select(
        "id, kind, email, name, note, school_name, team, created_at, programs(school_name, team)"
      )
      .eq("status", "open")
      .order("created_at", { ascending: true }),
  ]);

  const claimCount = claims?.length ?? 0;
  const requestCount = requests?.length ?? 0;

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="text-[22px] font-light tracking-[-0.4px] text-[var(--ink-900)]">
          Claims{claimCount > 0 && <span className="text-[var(--ink-400)]"> · {claimCount}</span>}
        </h1>
        <p className="mt-1.5 text-[12px] text-[var(--ink-500)]">
          Every claim is reviewed. A domain match means low risk, not approved.
        </p>

        <div className="mt-5 flex flex-col gap-3">
          {claimCount === 0 && (
            <p className="rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-card)] px-4 py-5 text-[13px] text-[var(--ink-500)]">
              Nothing waiting.
            </p>
          )}
          {claims?.map((claim) => (
            <ClaimRow key={claim.id as string} claim={claim} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[16px] font-medium text-[var(--ink-900)]">
          Requests{requestCount > 0 && <span className="text-[var(--ink-400)]"> · {requestCount}</span>}
        </h2>
        <p className="mt-1.5 text-[12px] text-[var(--ink-500)]">
          Invite requests, ownership disputes, and programs that are not in the
          directory.
        </p>

        <div className="mt-5 flex flex-col gap-3">
          {requestCount === 0 && (
            <p className="rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-card)] px-4 py-5 text-[13px] text-[var(--ink-500)]">
              Nothing waiting.
            </p>
          )}
          {requests?.map((request) => (
            <RequestRow key={request.id as string} request={request} />
          ))}
        </div>
      </section>
    </div>
  );
}
