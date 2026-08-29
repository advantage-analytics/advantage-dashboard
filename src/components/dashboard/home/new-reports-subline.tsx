"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { loadMatchAnalysis } from "@/lib/data/match-analysis-server";
import { isAnalysisReady } from "@/lib/data/match-analysis";
import { unseenReportIds } from "@/lib/ui/seen-reports";

/**
 * The greeting row's "N new report(s) →" link, or the day-zero help line.
 *
 * "New" has no column of its own (see `seen-reports.ts`) — a report is unread
 * until its match page has been opened on this device, so this is a small,
 * self-contained fetch rather than data threaded down from the server render.
 */
export function NewReportsSubline({
  userId,
  fallback,
}: {
  userId: string;
  fallback: string;
}) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("matches")
        .select("id")
        .eq("created_by", userId)
        .order("date", { ascending: false })
        .limit(50);
      const ids = (data ?? []).map((m) => m.id);
      if (ids.length === 0) {
        if (!cancelled) setCount(0);
        return;
      }
      const analysis = await loadMatchAnalysis(supabase, ids);
      const readyIds = ids.filter((id) => {
        const a = analysis.get(id);
        return a ? isAnalysisReady(a.status) : true; // no job row = imported/manual, already ready
      });
      if (!cancelled) setCount(unseenReportIds(readyIds).length);
    }
    load();
    const handler = () => load();
    window.addEventListener("match-processed", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("match-processed", handler);
    };
  }, [userId]);

  // An empty-but-present span still reserves its `gap-3` slot in the row
  // above the date, pushing it right of where the greeting title starts.
  // Only render the fallback when there's actually text to show.
  if (!count) return fallback ? <span className="text-body-sm">{fallback}</span> : null;

  return (
    <Link href="/dashboard/matches" className="text-[11px] font-medium" style={{ color: "var(--blue)" }}>
      {count} new report{count === 1 ? "" : "s"} →
    </Link>
  );
}
