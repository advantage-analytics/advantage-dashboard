import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPage } from "@/components/admin/admin-page";
import { LabelConsole } from "@/components/admin/labels/label-console";
import { getLabelSession } from "@/lib/data/labels-server";
import { labelProgress } from "@/lib/services/labels/session";

/**
 * Admin › Labels › one session — the hand-labelling console (board 08), T5:
 * the header, the video + court band and the points table, read-only.
 *
 * `force-dynamic` for the same reason as `admin/labels/page.tsx`: every read
 * is service-role and per request, and the video URL is signed per render.
 * `getLabelSession` re-checks `requireAdmin` even though `admin/layout.tsx`
 * already gates the route.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Label match" };

export default async function AdminLabelSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const result = await getLabelSession(sessionId);

  if (!result.ok) {
    if (result.reason === "not-found") notFound();
    return (
      <AdminPage className="gap-4">
        <h1 className="text-display">Label match</h1>
        <p className="text-body-sm">{result.message}</p>
      </AdminPage>
    );
  }

  const { session, video } = result;
  const { checked, total } = labelProgress(session.points);

  return (
    <AdminPage className="gap-6">
      <div className="flex items-end justify-between gap-8">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-display truncate">
            Label match · {session.player1Name} vs {session.player2Name}
          </h1>
          <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--ink-600)]">
            <span className="tabular">
              {checked} of {total} points checked
            </span>
            {session.status === "complete" ? <span>· Complete</span> : null}
            <span aria-hidden="true">·</span>
            <span className="mono text-[11px] text-[var(--ink-500)]">
              derivation {session.derivationVersion}
            </span>
          </p>
        </div>
        <Link
          href="/admin/labels"
          className="shrink-0 text-[13px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
        >
          Back to Labels
        </Link>
      </div>

      <LabelConsole session={session} video={video} />
    </AdminPage>
  );
}
