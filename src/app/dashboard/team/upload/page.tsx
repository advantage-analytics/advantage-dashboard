import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { isProgramStaff } from "@/lib/workspace/types";
import { getUploadQueue } from "@/lib/data/schedule-server";
import { getProgramUsage } from "@/lib/data/usage-server";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import { TeamUploadFlow } from "@/components/dashboard/schedule/upload/team-upload-flow";

/**
 * 22a–22f — the team upload wizard.
 *
 * `?entry=` pins a destination and starts the flow on its video step; without
 * it the wizard opens on the queue. That is the split 22f describes: the queue
 * exists for the day after a weekend, not for every upload.
 */
export default async function TeamUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ entry?: string }>;
}) {
  const { entry } = await searchParams;

  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active, viewer } = workspace;
  if (active.kind !== "team") redirect("/dashboard/matches/new");
  if (!isProgramStaff(active)) redirect("/dashboard/team/schedule");

  const billingMonth = currentBillingMonth();
  const [groups, usage] = await Promise.all([
    getUploadQueue(active.id),
    getProgramUsage(active.id, billingMonth),
  ]);

  return (
    <TeamUploadFlow
      groups={groups}
      pinnedEntryId={entry ?? null}
      programName={active.name}
      poolRemainingSeconds={Math.max(0, usage.capSeconds - usage.usedSeconds)}
      viewerInitials={viewer.initials}
    />
  );
}
