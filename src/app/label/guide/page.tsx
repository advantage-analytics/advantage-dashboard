import { AdminPage } from "@/components/admin/admin-page";
import { LabelGuide } from "@/components/label/label-guide";
import { requireLabelViewerOrNotFound } from "@/lib/services/programs/admin-guard";

/**
 * `/label/guide` — the labeller's guide: how the console works, then the
 * cleaning standard (`LabelGuide`, words in `src/lib/labels/guide-content.ts`).
 *
 * Gated by `label/layout.tsx`; the call here is that same gate re-run, as
 * every page beneath the layout does rather than trusting that it ran.
 */
export const metadata = { title: "Labelling guide" };

export default async function LabelGuidePage() {
  await requireLabelViewerOrNotFound();

  return (
    // `AdminPage` is only the shared page column — no admin chrome with it.
    <AdminPage>
      <LabelGuide />
    </AdminPage>
  );
}
