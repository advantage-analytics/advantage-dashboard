"use client";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { useIsDayZero } from "@/components/dashboard/presence-provider";
import { canUploadForProgram } from "@/lib/workspace/types";
import { MatchesTitleRow } from "@/components/dashboard/matches/matches-title-row";
import { MatchesSkeleton } from "@/components/dashboard/matches/matches-skeleton";
import { MatchesDayZeroPage } from "@/components/dashboard/matches/matches-day-zero";
import { useRecalledMatchesShape } from "@/components/dashboard/matches/matches-shape-memory";
export function MatchesPagePending() {
  const { active } = useWorkspace();
  const shape = useRecalledMatchesShape(active.id);
  const dayZero = useIsDayZero("matches");
  const scope = active.kind === "team" ? "team" : "personal";
  const canUpload = active.kind === "personal" || canUploadForProgram(active);
  // Nothing to load into rows: draw the page this resolves to, not a table.
  if (dayZero)
    return <MatchesDayZeroPage scope={scope} canUpload={canUpload} />;
  return (
    <div className="flex w-full flex-1 bg-[var(--surface-card)]">
      <div className="flex min-w-0 flex-1 flex-col gap-[18px] px-14 pt-5 pb-6">
        <MatchesTitleRow scope={scope} canUpload={canUpload} />
        <MatchesSkeleton scope={scope} shape={shape} />
      </div>
    </div>
  );
}
