import { notFound } from "next/navigation";

import { AdminPage } from "@/components/admin/admin-page";
import { getAdminTeam } from "@/lib/data/admin-team-server";

/**
 * The Admin › Teams detail frame — the centred column the page sits in.
 *
 * "Pages sit centred in their column. Not pushed to the left edge, not
 * stretched edge to edge" (the owner, `2026-11-12-admin-strip/README.md`):
 * the column is Today's 928px — the artboard's 1040px main less its gutters —
 * centred inside `AdminPage`'s padding, its blocks 40px apart as the artboard
 * stacks them. The header is the page's own (`page.tsx`), since it carries
 * this month's hours and sits above every view.
 *
 * `getAdminTeam()` is `cache()`d, so this and the page beneath it share one
 * set of round trips. `requireAdminOrNotFound()` already runs inside it, so
 * an unknown `programId` and a non-admin viewer both resolve to `notFound()`.
 */
export default async function AdminTeamLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const data = await getAdminTeam(programId);

  if (!data) {
    notFound();
  }

  return (
    <AdminPage>
      <div className="mx-auto flex w-full max-w-[928px] flex-col gap-10">
        {children}
      </div>
    </AdminPage>
  );
}
