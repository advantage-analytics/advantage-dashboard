"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ViewPills } from "@/components/admin/view-pills";
import type { AdminRequestsView } from "@/lib/data/admin-requests-server";

/**
 * Not in T14's file list — a small necessary addition, flagged the way T12
 * flagged its own extensions to a prior task's file.
 *
 * `ViewPills`' `onChange` needs a real client-side handler (`router.push`),
 * which a Server Component page cannot hand across the RSC boundary as a
 * plain prop. T15 owns the real `RequestsPageContent` (selection state
 * machine + drawer), so this file is deliberately NOT that: it does exactly
 * one thing — turn a pill click into a `?view=` URL change — so
 * `src/app/admin/requests/page.tsx` has something to render today. When T15
 * lands `RequestsPageContent`, this component's one job folds into it and
 * this file can go.
 *
 * Mirrors `teams-page-content.tsx`'s `pushCut` for the view-only case: the
 * default view (`waiting`) stays out of the URL so a first visit and a
 * deliberate reset produce the same address, and any view change drops
 * `after` (a keyset cursor from the previous view/order would skip rows).
 */
const VIEW_OPTIONS: { value: AdminRequestsView; label: string }[] = [
  { value: "waiting", label: "Waiting on you" },
  { value: "verifying", label: "Verifying" },
  { value: "live", label: "Live" },
  { value: "closed", label: "Closed" },
];

export function RequestsViewPills({ view }: { view: AdminRequestsView }) {
  const router = useRouter();
  const pathname = usePathname();

  const pushView = useCallback(
    (next: AdminRequestsView) => {
      const params = new URLSearchParams();
      if (next !== "waiting") params.set("view", next);
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router],
  );

  return <ViewPills options={VIEW_OPTIONS} value={view} onChange={pushView} />;
}
