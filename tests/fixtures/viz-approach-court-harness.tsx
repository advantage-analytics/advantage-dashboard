import { createRoot } from "react-dom/client";
import { CourtArt } from "@/components/dashboard/matches/match-detail/shots/court-art";
import type {
  VizDot,
  VizDotMeta,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";

/** `CourtArt` on the Approaches cut, from hand-built dots: the opened view
 *  (`labels`), the wall card (no `labels`), and an opened view whose dots
 *  carry a KNOWN left-handed opponent. No database, no model. */

function meta(extra: Partial<VizDotMeta>): VizDotMeta {
  return {
    setNumber: 1,
    pointScore: "15-0",
    wonBySubject: true,
    shotType: "Forehand",
    result: "In",
    isAce: false,
    entry: "approach",
    handAssumed: true,
    ...extra,
  };
}

// Right-hander assumed (hand unknown): the hitter's left third is their FH.
const DOTS: VizDot[] = [
  {
    id: "pair-fh",
    outcome: "won",
    shape: "circle",
    lateralM: -2,
    depthM: 8,
    atNet: false,
    pair: { lateralM: 1, depthM: 0.5 },
    meta: meta({ wing: "forehand" }),
  },
  {
    id: "pair-bh",
    outcome: "lost",
    shape: "triangle",
    lateralM: 3,
    depthM: 5,
    atNet: false,
    pair: { lateralM: -1, depthM: -1 },
    meta: meta({ wing: "backhand", shotType: "Backhand" }),
  },
  {
    id: "solo",
    outcome: "won",
    shape: "circle",
    lateralM: 0,
    depthM: 6,
    atNet: false,
    meta: meta({ wing: "middle" }),
  },
  {
    // Far out and far back: clamped to whichever window is drawn.
    id: "wild",
    outcome: "lost",
    shape: "circle",
    lateralM: 9,
    depthM: 15,
    atNet: false,
    pair: { lateralM: -9, depthM: 12 },
    meta: meta({ wing: "backhand" }),
  },
];

// A known left-hander: the left-third placement is their backhand.
const LEFTY_DOTS: VizDot[] = [
  {
    id: "lefty",
    outcome: "won",
    shape: "circle",
    lateralM: -2,
    depthM: 8,
    atNet: false,
    pair: { lateralM: 0, depthM: 0 },
    meta: meta({ wing: "backhand", handAssumed: false }),
  },
];

function Harness() {
  return (
    <div style={{ display: "flex", gap: 24, padding: 16 }}>
      <section data-testid="opened" style={{ width: 244 }}>
        <CourtArt cut="approaches" dots={DOTS} labels />
      </section>
      <section data-testid="card" style={{ width: 220 }}>
        <CourtArt cut="approaches" dots={DOTS} />
      </section>
      <section data-testid="lefty" style={{ width: 244 }}>
        <CourtArt cut="approaches" dots={LEFTY_DOTS} labels />
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
