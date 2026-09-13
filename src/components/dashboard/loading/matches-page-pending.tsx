"use client";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { canUploadForProgram } from "@/lib/workspace/types";
import { MatchesTitleRow } from "@/components/dashboard/matches/matches-title-row";
import { MatchesSkeleton } from "@/components/dashboard/matches/matches-skeleton";
export function MatchesPagePending() {
  const { active } = useWorkspace();
  return (
    <div className="flex w-full flex-1 bg-[var(--surface-card)]">
      <div className="flex min-w-0 flex-1 flex-col gap-[18px] px-14 pt-5 pb-6">
        <MatchesTitleRow
          scope={active.kind === "team" ? "team" : "personal"}
          canUpload={active.kind === "personal" || canUploadForProgram(active)}
        />
        <MatchesSkeleton />
      </div>
    </div>
  );
}
