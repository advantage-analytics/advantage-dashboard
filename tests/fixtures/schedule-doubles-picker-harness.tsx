import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { NewDualDataProvider } from "@/components/dashboard/schedule/static/dual-school-step";
import { DualLineupStep } from "@/components/dashboard/schedule/static/dual-build-step";
import { LineupProgress } from "@/components/dashboard/schedule/static/lineup-rows";
import { isDraftLineSet } from "@/lib/schedule/lineup-validation";
import { opponentPoolFor } from "@/components/dashboard/schedule/static/opponent-popup";
import type { LadderPlayer } from "@/lib/data/roster-server";
import type { LineupLine } from "@/lib/schedule/types";
import { resultLabelFromOutcome } from "@/components/dashboard/schedule/result-choice";
import { applySinglesOrder } from "@/lib/schedule/singles-order";
import { applyDoublesOrder } from "@/lib/schedule/doubles-order";

const ladder: LadderPlayer[] = [
  {
    userId: "11111111-1111-4111-8111-111111111111",
    name: "Alex Kim",
    ladderPosition: 1,
  },
  {
    userId: "22222222-2222-4222-8222-222222222222",
    name: "Alex Kim",
    ladderPosition: 2,
  },
  { userId: "casey-lee", name: "Casey Lee", ladderPosition: 3 },
  { userId: "jordan-lee", name: "Jordan Lee", ladderPosition: 4 },
  { userId: "riley-chen", name: "Riley Chen", ladderPosition: 5 },
  { userId: "drew-park", name: "Drew Park", ladderPosition: 6 },
];

const OPPONENT_ROSTER = [
  { playerId: "opp-1", name: "Morgan Reed", lineupSpot: 1, priorMeetings: 0 },
  { playerId: "opp-2", name: "Sam Ortiz", lineupSpot: 2, priorMeetings: 0 },
  { playerId: "opp-3", name: "Taylor Park", lineupSpot: 3, priorMeetings: 0 },
];

/** `?s2=1` adds a second singles line, Riley Chen against nobody named yet. */
const S2_LINE: LineupLine = {
  key: "S2",
  slot: "S2",
  discipline: "singles",
  ourIds: ["riley-chen"],
  ourLabels: ["Riley Chen"],
  theirLabels: [],
  noPlayer: false,
  theirNoPlayer: false,
};

const initialLines: LineupLine[] = [
  {
    key: "S1",
    slot: "S1",
    discipline: "singles",
    ourIds: ["11111111-1111-4111-8111-111111111111"],
    ourLabels: ["Alex Kim"],
    theirLabels: ["Morgan Reed"],
    noPlayer: false,
    theirNoPlayer: false,
  },
  {
    key: "D1",
    slot: "D1",
    discipline: "doubles",
    ourIds: [],
    ourLabels: [],
    theirLabels: ["Morgan Reed", "Sam Ortiz"],
    noPlayer: false,
    theirNoPlayer: false,
  },
  {
    key: "D2",
    slot: "D2",
    discipline: "doubles",
    ourIds: ["22222222-2222-4222-8222-222222222222", "casey-lee"],
    ourLabels: ["Alex Kim", "Casey Lee"],
    theirLabels: ["Taylor Park", "Robin Shah"],
    noPlayer: false,
    theirNoPlayer: false,
  },
  {
    key: "D3",
    slot: "D3",
    discipline: "doubles",
    ourIds: ["11111111-1111-4111-8111-111111111111", "jordan-lee"],
    ourLabels: ["Alex Kim", "Jordan Lee"],
    theirLabels: ["Avery Stone", "Jamie Fox"],
    noPlayer: false,
    theirNoPlayer: false,
  },
];

/**
 * `?free=1` settles nothing on doubles — D3 is not played — and puts a pair on
 * D1, so all three doubles pairs can be dragged. Without it D3 is settled (the
 * `?locked` case), which freezes the doubles block into plain rows.
 */
const FREE = new URLSearchParams(window.location.search).get("free") !== null;

function seededLines(): LineupLine[] {
  const params = new URLSearchParams(window.location.search);
  const lines = params.get("s2")
    ? [initialLines[0], S2_LINE, ...initialLines.slice(1)]
    : initialLines;
  if (!FREE) return lines;
  return lines.map((line) =>
    line.key === "D1"
      ? {
          ...line,
          ourIds: ["riley-chen", "drew-park"],
          ourLabels: ["Riley Chen", "Drew Park"],
        }
      : line,
  );
}

declare global {
  interface Window {
    doublesSelections: { key: string; ids: string[]; labels: string[] }[];
  }
}

window.doublesSelections = [];

function Harness() {
  const [lines, setLines] = useState(seededLines);
  const scope = useRef<HTMLDivElement>(null);
  const outcome = new URLSearchParams(window.location.search).get("outcome");
  const locked = {
    ...(FREE ? {} : { D3: "played" as const }),
    ...(outcome
      ? {
          S1: resultLabelFromOutcome({
            kind: "forfeit",
            side: outcome === "ours" ? "ours" : "theirs",
          }),
        }
      : {}),
  };

  function updateLine(
    key: string,
    patch: Pick<LineupLine, "ourIds" | "ourLabels">,
  ) {
    window.doublesSelections.push({
      key,
      ids: patch.ourIds,
      labels: patch.ourLabels,
    });
    setLines((current) =>
      current.map((line) =>
        line.key === key ? { ...line, ...patch, noPlayer: false } : line,
      ),
    );
  }

  return (
    <NewDualDataProvider
      data={{
        ladder,
        defaultSurface: null,
        ourConference: null,
        ourTeam: "mens",
        ourDivision: "D1",
        ourProgramKey: "our-program",
        directory: [],
        historyEntries: [],
        directoryTotal: 0,
      }}
    >
      <div ref={scope}>
        <DualLineupStep
          lines={lines}
          locked={locked}
          pool={
            // `?roster=1` gives the opponent a saved roster to pick from.
            new URLSearchParams(window.location.search).get("roster")
              ? opponentPoolFor("program:test", "Test Opponent", {
                  forKey: "program:test",
                  candidates: OPPONENT_ROSTER,
                })
              : opponentPoolFor("text:Test Opponent", "Test Opponent", null)
          }
          onOurLabels={(key, value) =>
            setLines((current) =>
              current.map((line) =>
                line.key === key
                  ? {
                      ...line,
                      ourIds: [],
                      ourLabels: value ? [value] : [],
                      noPlayer: false,
                    }
                  : line,
              ),
            )
          }
          onOurSelection={(key, selection) =>
            updateLine(key, {
              ourIds: selection.ids,
              ourLabels: selection.labels,
            })
          }
          onTheirLabels={(key, value) =>
            setLines((current) =>
              current.map((line) =>
                line.key === key
                  ? { ...line, theirLabels: [value], theirNoPlayer: false }
                  : line,
              ),
            )
          }
          onTheirNoPlayer={(key) =>
            setLines((current) =>
              current.map((line) =>
                line.key === key && !line.noPlayer
                  ? { ...line, theirLabels: [], theirNoPlayer: true }
                  : line,
              ),
            )
          }
          onNoPlayer={(key) =>
            setLines((current) =>
              current.map((line) =>
                line.key === key
                  ? {
                      ...line,
                      ourIds: [],
                      ourLabels: [],
                      theirLabels: [],
                      noPlayer: true,
                      theirNoPlayer: false,
                    }
                  : line,
              ),
            )
          }
          onSinglesOrder={(order) =>
            setLines((current) => applySinglesOrder(current, order, locked))
          }
          onDoublesOrder={(order) =>
            setLines((current) => applyDoublesOrder(current, order, locked))
          }
        />
      </div>
      <LineupProgress
        set={
          lines.filter((line) => isDraftLineSet(line) || line.key in locked)
            .length
        }
        total={lines.length}
        scope={scope}
      />
      <output aria-label="Lineup state">{JSON.stringify(lines)}</output>
      <output aria-label="D1 roster ids">
        {lines.find((line) => line.key === "D1")?.ourIds.join("|")}
      </output>
      <output aria-label="D1 roster labels">
        {lines.find((line) => line.key === "D1")?.ourLabels.join("|")}
      </output>
      <output aria-label="D2 roster ids">
        {lines.find((line) => line.key === "D2")?.ourIds.join("|")}
      </output>
      <output aria-label="Singles roster ids">
        {lines.find((line) => line.key === "S1")?.ourIds.join("|")}
      </output>
    </NewDualDataProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
document.documentElement.dataset.hydrated = "true";
