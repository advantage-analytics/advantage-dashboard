import { listAdminAskFeedback } from "@/lib/data/ask-admin-server";
import { AskFeedbackPageContent } from "@/components/admin/ask-feedback-page-content";

/**
 * Admin › Ask — every thumb put on an Ask answer, down-votes first, with the
 * question, the SQL that answered it, the answer and the note beside each,
 * and a way into PostHog's LLM analytics for the run
 * (docs/ask-improvement-roadmap.md, 4.9).
 *
 * `force-dynamic` for the same reason as the other admin pages: every read is
 * service-role and gated on the current session's `is_admin`.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Ask feedback" };

export default async function AdminAskPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const [rows, { id }] = await Promise.all([
    listAdminAskFeedback(),
    searchParams,
  ]);
  return (
    <AskFeedbackPageContent
      rows={rows}
      initialSelectedId={typeof id === "string" ? id : null}
    />
  );
}
