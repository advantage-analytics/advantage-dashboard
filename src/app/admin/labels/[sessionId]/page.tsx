import Link from "next/link";
import { AdminPage } from "@/components/admin/admin-page";

/**
 * Placeholder for the hand-labelling console, T5's page.
 *
 * T4 only needs this route to exist so `StartLabellingButton` has somewhere
 * to land and `npm run map` lists it. Kept intentionally tiny — T5 replaces
 * the whole body with the real console (video, point list, label form) and
 * should not have to unwind anything built here first.
 */
export const metadata = { title: "Label match" };

export default async function AdminLabelSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  return (
    <AdminPage className="gap-4">
      <div>
        <h1 className="text-display">Label match</h1>
        <p className="text-body-sm mt-[9px]">Session {sessionId}</p>
      </div>
      <Link
        href="/admin/labels"
        className="text-[13px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
      >
        Back to Labels
      </Link>
    </AdminPage>
  );
}
