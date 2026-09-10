import { useState } from "react";
import { createRoot } from "react-dom/client";
import { NewDualDataProvider } from "@/components/dashboard/schedule/static/dual-school-step";
import { DualLineupStep } from "@/components/dashboard/schedule/static/dual-build-step";
import { opponentPoolFor } from "@/components/dashboard/schedule/static/opponent-popup";
import type { LadderPlayer } from "@/lib/data/roster-server";
import type { LineupLine } from "@/lib/schedule/types";

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
];

const initialLines: LineupLine[] = [
  {
    key: "S1",
    slot: "S1",
    discipline: "singles",
    ourIds: ["11111111-1111-4111-8111-111111111111"],
    ourLabels: ["Alex Kim"],
    theirLabels: ["Morgan Reed"],
    forfeit: null,
  },
  {
    key: "D1",
    slot: "D1",
    discipline: "doubles",
    ourIds: [],
    ourLabels: [],
    theirLabels: ["Morgan Reed", "Sam Ortiz"],
    forfeit: null,
  },
  {
    key: "D2",
    slot: "D2",
    discipline: "doubles",
    ourIds: ["22222222-2222-4222-8222-222222222222", "casey-lee"],
    ourLabels: ["Alex Kim", "Casey Lee"],
    theirLabels: ["Taylor Park", "Robin Shah"],
    forfeit: null,
  },
  {
    key: "D3",
    slot: "D3",
    discipline: "doubles",
    ourIds: ["11111111-1111-4111-8111-111111111111", "jordan-lee"],
    ourLabels: ["Alex Kim", "Jordan Lee"],
    theirLabels: ["Avery Stone", "Jamie Fox"],
    forfeit: null,
  },
];

declare global {
  interface Window {
    doublesSelections: { key: string; ids: string[]; labels: string[] }[];
  }
}

window.doublesSelections = [];

function Harness() {
  const [lines, setLines] = useState(initialLines);

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
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  return (
    <NewDualDataProvider
      data={{
        ladder,
        defaultSurface: null,
        ourConference: null,
        ourTeam: "mens",
        ourDivision: "D-I",
        ourProgramKey: "our-program",
        conferencePrograms: [],
        historyEntries: [],
        directoryTotal: 0,
      }}
    >
      <DualLineupStep
        lines={lines}
        locked={{ D3: "played" }}
        pool={opponentPoolFor("text:Test Opponent", "Test Opponent", null)}
        laddered
        onOurLabels={() => undefined}
        onOurSelection={(key, selection) =>
          updateLine(key, {
            ourIds: selection.ids,
            ourLabels: selection.labels,
          })
        }
        onTheirLabels={() => undefined}
        onForfeit={() => undefined}
      />
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
