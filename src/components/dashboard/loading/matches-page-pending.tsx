"use client";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { canUploadForProgram } from "@/lib/workspace/types";
import { MatchesTitleRow } from "@/components/dashboard/matches/matches-title-row";
import { MatchesSkeleton } from "@/components/dashboard/matches/matches-skeleton";
export function MatchesPagePending() {
  const { active } = useWorkspace();
  return (
    <div className="w-full flex-1 bg-white">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 px-6 pt-5 pb-6 lg:px-14">
        <MatchesTitleRow
          scope={active.kind === "team" ? "team" : "personal"}
          canUpload={active.kind === "personal" || canUploadForProgram(active)}
        />
        <MatchesSkeleton />
      </div>
    </div>
  );
}
