import { redirect } from "next/navigation";
import { LegalUpdateForm } from "@/components/legal/legal-update-form";
import { readMissingLegalDocuments } from "@/lib/legal/acceptance-server";
import { LEGAL_DOCUMENTS, legalUpdateCopy } from "@/lib/legal/versions";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Our terms" };

/**
 * The day these versions took effect (Terms 2.0, Privacy 1.4, Guardian 1.1).
 * An account created before it agreed — if it agreed to anything — to older
 * words, so the screen tells it the terms changed rather than asking as if
 * for the first time.
 */
const VERSIONS_EFFECTIVE = "2026-10-25T00:00:00Z";

/**
 * The one-time terms screen. `dashboard/layout.tsx` sends an onboarded account
 * here while it holds no current-version `legal_acceptances` row for a
 * document it needs (`requiredLegalDocuments`); agreeing records the missing
 * rows and returns to the dashboard.
 *
 * Outside `/dashboard` on purpose, like `/onboarding`: the dashboard layout
 * is what redirects here, so living under it would loop. The mirror check
 * below sends an account with nothing missing straight back, so a bookmarked
 * URL never asks twice.
 */
export default async function TermsUpdatePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: row }, { count: priorAcceptances }] = await Promise.all([
    supabase
      .from("users")
      .select("role, created_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("legal_acceptances")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  const role = (row?.role as string | null | undefined) ?? null;
  const missing = await readMissingLegalDocuments(supabase, user.id, role);
  if (missing.length === 0) redirect("/dashboard");

  const createdAt = (row?.created_at as string | null | undefined) ?? null;
  const returning =
    (priorAcceptances ?? 0) > 0 ||
    (createdAt !== null && new Date(createdAt) < new Date(VERSIONS_EFFECTIVE));

  return (
    // Onboarding's own frame: a full-screen pane with no dashboard chrome and
    // no exit door — the form's Sign out is the way out.
    <div className="flex min-h-dvh items-center bg-[var(--surface-card)] px-6 py-24 sm:px-10">
      <div className="mx-auto w-full" style={{ maxWidth: 640 }}>
        <LegalUpdateForm
          copy={legalUpdateCopy({ returning, guardian: role === "parent" })}
          documents={LEGAL_DOCUMENTS.filter((document) =>
            missing.includes(document),
          )}
        />
      </div>
    </div>
  );
}
