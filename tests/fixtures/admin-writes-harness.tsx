import { useState, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import AdminError from "@/app/admin/error";
import { AddConferenceDialog } from "@/components/admin/add-conference-dialog";
import { ApprovePilotPopover } from "@/components/admin/approve-pilot-popover";
import { ConferenceDrawer } from "@/components/admin/conference-drawer";
import { HistoryActionButton } from "@/components/admin/history-action-button";
import { useStartLabelling } from "@/components/admin/labels/start-labelling-button";
import { MergeConferenceDialog } from "@/components/admin/merge-conference-dialog";
import { TeamsPageContent } from "@/components/admin/teams-page-content";
import type { AdminConferenceRow } from "@/lib/data/admin-conferences-view";
import { answer } from "./admin-team-actions-browser-mock";
import { HarnessBoundary } from "./admin-team-harness-boundary";

/**
 * The admin writes outside /admin/teams/[programId], one surface per `?surface=`
 * so a page need not hold two drawers, with the server actions swapped for
 * `admin-team-actions-browser-mock.ts`. `tests/admin-writes.spec.ts` drives it.
 */
const conference = (id: string, name: string): AdminConferenceRow => ({
  id,
  name,
  shortName: null,
  division: null,
  website: null,
  label: name,
  teams: 0,
  onAdvantage: 0,
  pilot: 0,
  schools: 0,
  squads: null,
  updatedAt: "2026-10-01T00:00:00Z",
  crestUrl: null,
});

const ivy = conference("ivy", "Ivy League");
const patriot = conference("patriot", "Patriot League");
const noop = () => {};

function StartLabelling() {
  const { start, error } = useStartLabelling("job");
  return (
    <>
      <button type="button" onClick={start}>
        Start labelling
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}

const teamsProps = {
  rows: [],
  freshIds: [],
  joinedCount: 0,
  viewCounts: { all: 0 },
  nextCursor: "next",
  view: "all",
  sort: "name_asc",
  cut: { division: null, conference: null, state: null },
  facets: { divisions: [], conferences: [], states: [] },
} as unknown as ComponentProps<typeof TeamsPageContent>;

/** What Next hands a segment's `error.tsx`, per `?kind=`. */
function caught(kind: string | null): Error & { digest?: string } {
  if (kind === "server") {
    return Object.assign(new Error("A Server Component threw"), {
      digest: "1234567890",
    });
  }
  if (kind === "closed") return new Error("Connection closed.");
  return new TypeError("Cannot read properties of undefined");
}

function Surface({ params }: { params: URLSearchParams }) {
  const [open, setOpen] = useState(true);
  switch (params.get("surface")) {
    case "conference":
      return (
        <ConferenceDrawer
          row={ivy}
          index={0}
          total={1}
          canPrev={false}
          canNext={false}
          closing={false}
          autoFocus={false}
          onPrev={noop}
          onNext={noop}
          onClose={noop}
          onClosed={noop}
          onChanged={noop}
          conferences={[ivy, patriot]}
          onMerged={noop}
          onDeleted={noop}
        />
      );
    case "merge":
      return (
        <MergeConferenceDialog
          open={open}
          onOpenChange={setOpen}
          source={ivy}
          conferences={[ivy, patriot]}
          onMerged={noop}
        />
      );
    case "add-conference":
      return (
        <AddConferenceDialog
          open={open}
          onOpenChange={setOpen}
          onCreated={noop}
        />
      );
    case "approve":
      return (
        <ApprovePilotPopover
          target={{
            claimId: "claim",
            teamName: "Centennial",
            anchorRect: { top: 40, left: 40, width: 60, height: 20 },
          }}
          onClose={noop}
          onDecided={noop}
        />
      );
    case "labelling":
      return <StartLabelling />;
    case "history":
      return (
        <HistoryActionButton
          action={async () => {
            await answer();
            return { ok: true };
          }}
          fields={{ operationId: "operation" }}
          label="Reconcile"
        />
      );
    case "teams":
      return <TeamsPageContent {...teamsProps} />;
    case "boundary":
      return <AdminError error={caught(params.get("kind"))} retry={noop} />;
    default:
      throw new Error("Unknown surface");
  }
}

createRoot(document.getElementById("root")!).render(
  <HarnessBoundary>
    <Surface params={new URLSearchParams(window.location.search)} />
  </HarnessBoundary>,
);
document.documentElement.dataset.hydrated = "true";
