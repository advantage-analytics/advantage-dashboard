import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ListOrdered } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PeekDrawerFrame } from "@/components/dashboard/matches/match-drawer";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import {
  EventGroupHead,
  EventHeader,
  EventPageLayout,
  EventRow,
  EventTable,
  EventTableFooter,
  EventToolbar,
  SummaryCell,
  SummaryStrip,
} from "@/components/dashboard/schedule/event-table";
import { useRowSelection } from "@/components/dashboard/schedule/use-row-selection";

/**
 * The event-table kit on three fixed rows — `a` and `b` singles, `c` doubles
 * — with two pills, a Result filter, a two-order sort and a `Line` drawer.
 * `?line=` on the harness URL is read here and handed in as `initialId`,
 * the way a server page hands `searchParams` down; the navigation mock's
 * `useSearchParams()` returns null.
 */

type Pill = "all" | "doubles";
type Result = "won" | "lost" | "undecided";
type Sort = "line" | "player";

interface Line {
  id: string;
  slot: string;
  player: string;
  doubles: boolean;
  result: Result;
}

const LINES: Line[] = [
  { id: "a", slot: "S1", player: "Brooks", doubles: false, result: "won" },
  { id: "b", slot: "S2", player: "Reid", doubles: false, result: "lost" },
  {
    id: "c",
    slot: "D1",
    player: "Osei / Tanaka",
    doubles: true,
    result: "undecided",
  },
];

const GRID = "grid-cols-[28px_minmax(170px,1fr)_96px]";

function Harness({ initialId }: { initialId: string | null }) {
  const [pill, setPill] = useState<Pill>("all");
  const [result, setResult] = useState<Result | null>(null);
  const [sort, setSort] = useState<Sort>("line");

  const visible = useMemo(() => {
    const cut = LINES.filter(
      (line) =>
        (pill === "all" || line.doubles) &&
        (result === null || line.result === result),
    );
    return sort === "line"
      ? cut
      : [...cut].sort((x, y) => x.player.localeCompare(y.player));
  }, [pill, result, sort]);

  const selection = useRowSelection({
    ids: visible.map((line) => line.id),
    initialId,
    param: "line",
  });

  const drawerLine = LINES.find((line) => line.id === selection.drawerId);
  const singles = visible.filter((line) => !line.doubles);
  const doubles = visible.filter((line) => line.doubles);

  const row = (line: Line) => (
    <EventRow
      key={line.id}
      id={line.id}
      grid={GRID}
      selected={selection.selectedId === line.id}
      onToggle={selection.toggle}
      label={line.id}
    >
      <span className="mono text-[11px]">{line.slot}</span>
      <span className="truncate text-[13px] font-medium">{line.player}</span>
      <span className="text-[12px]">{line.result}</span>
    </EventRow>
  );

  return (
    <EventPageLayout
      header={
        <EventHeader
          title="vs Fairmont A&M"
          subline={["Sat, Sep 20", "Away", "Hard"]}
        />
      }
      strip={
        <SummaryStrip>
          <SummaryCell label="Result" value="Won 1–1" trailing="Final" />
          <SummaryCell label="Lines" value="3" trailing="lines" />
        </SummaryStrip>
      }
      toolbar={
        <EventToolbar<Pill, "result", Sort>
          pills={[
            { value: "all", label: "All lines" },
            { value: "doubles", label: "Doubles" },
          ]}
          pill={pill}
          onPillChange={setPill}
          filter={{
            sections: [
              {
                label: "Result",
                segmented: [
                  {
                    key: "result",
                    options: [
                      { value: null, label: "Any" },
                      { value: "won", label: "Won" },
                      { value: "lost", label: "Lost" },
                      { value: "undecided", label: "Undecided" },
                    ],
                  },
                ],
              },
            ],
            value: () => result,
            onSelect: (_key, value) => setResult(value as Result | null),
            onClear: () => setResult(null),
            hasActive: result !== null,
            resultCount: visible.length,
            totalCount: LINES.length,
            label: "Filter lines",
            noun: { singular: "line", plural: "lines" },
          }}
          sort={{
            options: [
              { value: "line", label: "Line order" },
              { value: "player", label: "Player" },
            ],
            value: sort,
            onChange: setSort,
          }}
        />
      }
      table={
        <EventTable
          grid={GRID}
          columns={["Line", "Player", "Result"]}
          rowCount={visible.length}
          empty={
            <TableEmptyBody
              icon={ListOrdered}
              title="No lines in this view"
              action={{
                label: "Show all lines",
                onClick: () => setPill("all"),
              }}
            />
          }
        >
          {singles.length > 0 ? (
            <>
              <EventGroupHead label="Singles" value="1–1" first />
              {singles.map(row)}
            </>
          ) : null}
          {doubles.length > 0 ? (
            <>
              <EventGroupHead
                label="Doubles"
                trailing="score only"
                first={singles.length === 0}
              />
              {doubles.map(row)}
            </>
          ) : null}
        </EventTable>
      }
      footer={<EventTableFooter start="Singles best of 3, no-ad" />}
      drawer={
        drawerLine ? (
          <PeekDrawerFrame
            kind="Line"
            label={`Line ${drawerLine.slot}`}
            index={selection.index}
            total={selection.total}
            canPrev={selection.canPrev}
            canNext={selection.canNext}
            closing={selection.closing}
            autoFocus={selection.openedByKeyboard}
            focusKey={drawerLine.id}
            footer={null}
            onPrev={() => selection.step(-1)}
            onNext={() => selection.step(1)}
            onClose={() => selection.close(drawerLine.id)}
            onClosed={selection.finishClose}
          >
            <div className="px-[22px] py-4">{drawerLine.player}</div>
          </PeekDrawerFrame>
        ) : null
      }
    />
  );
}

const initialId = new URLSearchParams(location.search).get("line");

createRoot(document.getElementById("root")!).render(
  <TooltipProvider>
    <Harness initialId={initialId} />
  </TooltipProvider>,
);
document.documentElement.dataset.hydrated = "true";
