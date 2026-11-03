import { AdminPage } from "@/components/admin/admin-page";
import { requireLabelViewerOrNotFound } from "@/lib/services/programs/admin-guard";

/** `/label/guide` — placeholder until T9 writes the labelling guide. */
export const metadata = { title: "Labelling guide" };

export default async function LabelGuidePage() {
  await requireLabelViewerOrNotFound();

  return (
    <AdminPage className="gap-3">
      <h1 className="text-display">Guide</h1>
      <p className="text-body-sm">The labelling guide is coming soon.</p>
    </AdminPage>
  );
}
