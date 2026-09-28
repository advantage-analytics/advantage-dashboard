import { AdminPage } from "@/components/admin/admin-page";
import { LabelsTable } from "@/components/admin/labels/labels-table";
import { listLabelJobs } from "@/lib/data/labels-server";

/**
 * Admin › Labels — the hand-labelling console's entry point, T4.
 *
 * `force-dynamic` for the same reason `admin/requests/page.tsx` is: every
 * read here is service-role and per-request, gated on the *current* session's
 * `is_admin` (`requireAdminOrNotFound` in `admin/layout.tsx` already gates the
 * route; `listLabelJobs` re-checks it anyway, matching every other admin
 * loader).
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Labels" };

export default async function AdminLabelsPage() {
  const result = await listLabelJobs();

  return (
    <AdminPage className="gap-4">
      <div>
        <h1 className="text-display">Labels</h1>
        <p className="text-body-sm mt-[9px]">
          Hand-label a completed Advantage Intelligence job to build ground
          truth for the derivation engine.
        </p>
      </div>

      {result.ok ? (
        <LabelsTable rows={result.rows} />
      ) : (
        <p className="text-body-sm">{result.message}</p>
      )}
    </AdminPage>
  );
}
