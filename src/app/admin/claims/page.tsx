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
 * signed up, which reads like phishing and burns a sending domain.
 *
 * What decides a claim is an EXACT match against `program_contacts`: the
 * address is the one recorded for this team's staff. That is identity evidence
 * and it approves on its own. A domain match is not — it says "someone at this
 * school", which is a student, an alum, or anyone in the faculty — so it stays
 * here as evidence a person weighs, alongside `staff_page_url`.
 *
 * Hence two sections. The first is work. The second is a record: those claims
 * are already live, and the only reason to open one is to take it back.
 *
 * The second section is titled "Live" rather than "Approved automatically"
 * because approving something in the first section moves it here — grouping is
 * by status, not by which route got it there. The per-row chip carries that
 * distinction.
 *
 * A third section exists because `rejected` claims were being fetched nowhere.
 * They were invisible, and once the state machine gained `reopen` that also
 * made them unreachable: a rejection could not be undone because there was no
 * screen showing it. Closed claims are listed so a wrong decision has a way
 * back.
 */
const CLAIM_FIELDS =
  "id, claimed_email, claimant_name, claimant_role, domain_matched, skips_manual_review, contact_matched, match_reason, status, created_at, programs(school_name, team, division, state, staff_page_url, review_reasons)";

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-card)] px-4 py-5 text-[13px] text-[var(--ink-500)]">
      {children}
    </p>
  );
}

export default async function ReviewQueuePage() {
  const db = createAdminClient();

  const [{ data: waiting }, { data: settled }, { data: closed }, { data: requests }] =
    await Promise.all([
      db
        .from("program_claims")
        .select(CLAIM_FIELDS)
        // `objected` sits here too: it is terminal, but it is the one outcome
        // that means somebody disputed a program, which is worth seeing.
        .eq("status", "pending_review")
        .order("created_at", { ascending: true }),
      db
        .from("program_claims")
        .select(CLAIM_FIELDS)
        .eq("status", "objection_window")
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("program_claims")
        .select(CLAIM_FIELDS)
        .in("status", ["rejected", "objected"])
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("program_requests")
        .select(
          "id, kind, email, name, role, note, school_name, team, created_at, programs(school_name, team)"
        )
        .eq("status", "open")
        .order("created_at", { ascending: true }),
    ]);

  const waitingCount = waiting?.length ?? 0;
  const settledCount = settled?.length ?? 0;
  const closedCount = closed?.length ?? 0;
  const requestCount = requests?.length ?? 0;

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="text-[22px] font-light tracking-[-0.4px] text-[var(--ink-900)]">
          Waiting on you
          {waitingCount > 0 && (
            <span className="text-[var(--ink-400)]"> · {waitingCount}</span>
          )}
        </h1>
        <p className="mt-1.5 text-[12px] text-[var(--ink-500)]">
          The claimed address isn&#39;t on the program&#39;s recorded staff list.
          The staff page link is one click away.
        </p>

        <div className="mt-5 flex flex-col gap-3">
          {waitingCount === 0 && <EmptyNote>Nothing waiting.</EmptyNote>}
          {waiting?.map((claim) => (
            <ClaimRow key={claim.id as string} claim={claim} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[16px] font-medium text-[var(--ink-900)]">
          Live
          {settledCount > 0 && (
            <span className="text-[var(--ink-400)]"> · {settledCount}</span>
          )}
        </h2>
        <p className="mt-1.5 text-[12px] text-[var(--ink-500)]">
          Claims that settled — either the address was already on the program&#39;s
          staff list, or you approved it. The chip on each row says which.
          Nothing to do; open one only to hand it back.
        </p>

        <div className="mt-5 flex flex-col gap-3">
          {settledCount === 0 && <EmptyNote>None yet.</EmptyNote>}
          {settled?.map((claim) => (
            <ClaimRow key={claim.id as string} claim={claim} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[16px] font-medium text-[var(--ink-900)]">
          Closed
          {closedCount > 0 && (
            <span className="text-[var(--ink-400)]"> · {closedCount}</span>
          )}
        </h2>
        <p className="mt-1.5 text-[12px] text-[var(--ink-500)]">
          Rejected, or objected to. The program went back to unclaimed. Put one
          back in the queue if the decision was wrong.
        </p>

        <div className="mt-5 flex flex-col gap-3">
          {closedCount === 0 && <EmptyNote>Nothing closed.</EmptyNote>}
          {closed?.map((claim) => (
            <ClaimRow key={claim.id as string} claim={claim} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[16px] font-medium text-[var(--ink-900)]">
          Requests
          {requestCount > 0 && (
            <span className="text-[var(--ink-400)]"> · {requestCount}</span>
          )}
        </h2>
        <p className="mt-1.5 text-[12px] text-[var(--ink-500)]">
          Invite requests, ownership disputes, and programs that are not in the
          directory.
        </p>

        <div className="mt-5 flex flex-col gap-3">
          {requestCount === 0 && <EmptyNote>Nothing waiting.</EmptyNote>}
          {requests?.map((request) => (
            <RequestRow key={request.id as string} request={request} />
          ))}
        </div>
      </section>
    </div>
  );
}
