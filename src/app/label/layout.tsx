import { LabelHeader } from "@/components/label/label-header";
import { requireLabelViewerOrNotFound } from "@/lib/services/programs/admin-guard";

/**
 * The labeller's area, gated once for everything beneath it.
 *
 * Deliberately outside `/admin`: a labeller is not an admin and must never be
 * shown the console's navigation, counts or search. The gate
 * (`requireLabelViewerOrNotFound`) sends a visitor with no session to login
 * and answers `notFound()` to anyone signed in who is neither an admin nor a
 * labeller; pages and loaders beneath re-run it rather than trusting that
 * this ran. The layout guards the page, not the write — every label write
 * still passes `requireLabelActor`.
 *
 * `src/proxy.ts` already refreshes the session here: its matcher excludes
 * only webhooks, cron and static files.
 */
export default async function LabelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireLabelViewerOrNotFound();

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-[var(--surface-card)]">
      <LabelHeader />
      <div className="flex flex-1 shrink-0 items-stretch">{children}</div>
    </div>
  );
}
