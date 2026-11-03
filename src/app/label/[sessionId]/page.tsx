import { AdminPage } from "@/components/admin/admin-page";
import { requireLabelViewerOrNotFound } from "@/lib/services/programs/admin-guard";

/**
 * `/label/[sessionId]` — placeholder until T6 builds the labeller's console.
 * Gated by `label/layout.tsx` and re-gated here; it reads and renders no
 * session data, so an unassigned id shows nothing it should not.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Labels" };

export default async function LabelSessionPage() {
  await requireLabelViewerOrNotFound();

  return (
    <AdminPage className="gap-3">
      <h1 className="text-display">Coming soon</h1>
      <p className="text-body-sm">
        Labelling a match from here is not ready yet.
      </p>
    </AdminPage>
  );
}
