import Link from "next/link";
import {
  DayZeroOffer,
  MATCH_OFFER_CONDITIONS,
} from "@/components/dashboard/home/day-zero-offer";
import {
  DayZeroShape,
  GHOST_OPACITY,
  GhostRule,
} from "@/components/dashboard/home/day-zero-shape";
import { KpiStripEmpty } from "@/components/dashboard/home/kpi-strip-empty";
import { advButton } from "@/lib/ui/adv-button";
import { HISTORY_GRID, MatchHistoryHeader } from "./match-history-card";
import { LineHistoryGhostRows, LineHistoryHeader } from "./line-history-card";
import { ServePlacementCard } from "./serve-placement-card";

/**
 * The profile before this player has a match.
 *
 * SKILL.md → Table page states, the composition Roster, Schedule and Matches
 * already draw: the offer, centred, over the page's own anatomy at 0.32 and
 * `inert`. The identity row above this is REAL — the person exists, and
 * their name, class year and the buttons that act on them are facts today —
 * so it stays at full opacity and this begins beneath it.
 *
 * What dims: the KPI strip (the real empty one, labelled for this page's
 * five), then the four cards as ghosts — real column headers over grey
 * rules, and the serve strip's own drawn court, which is already its empty
 * state and needs no ghost.
 *
 * The offer's verb depends on who can act. A coach, or a player the program
 * lets upload, gets **New match**; a player who cannot gets `null` — the
 * conditions sentence carries the whole answer, and nothing refuses on
 * click.
 */
const HISTORY_RULES: readonly React.ComponentProps<typeof GhostRule>[] = [
  { width: "70%" }, // Date
  { width: "55%", tone: "200", shape: "tall" }, // Name
  { width: "60%" }, // School
  { width: "20px" }, // Line
  { width: "14px", shape: "dot" }, // outcome
  { width: "65%" }, // Score
];

function GhostRow({
  grid,
  rules,
  opacity,
  gap,
}: {
  grid: string;
  rules: readonly React.ComponentProps<typeof GhostRule>[];
  opacity: number;
  gap: string;
}) {
  return (
    <div className={`grid ${grid} h-11 items-center ${gap}`} style={{ opacity }} aria-hidden="true">
      {rules.map((rule, i) => (
        <span key={i} className="flex items-center">
          <GhostRule {...rule} />
        </span>
      ))}
    </div>
  );
}

export function ProfileDayZero({
  mode,
  firstName,
  playerId,
  canUpload,
  serve,
}: {
  mode: "self" | "staff" | "viewer";
  firstName: string;
  playerId: string;
  canUpload: boolean;
  serve: Parameters<typeof ServePlacementCard>[0]["serve"];
}) {
  const headline =
    mode === "self"
      ? "Every match you play lands here."
      : `Every match ${firstName} plays lands here.`;

  const conditions =
    mode === "self"
      ? canUpload
        ? "Send a match video or a SwingVision export; the report comes back to this page."
        : "Your coaching staff send the program's match video. Every report lands here, yours included."
      : mode === "staff"
        ? MATCH_OFFER_CONDITIONS
        : "The coaching staff send the program's match video. Every report lands here.";

  return (
    <div className="flex flex-1 flex-col gap-5">
      <DayZeroOffer
        headline={headline}
        headlineMeasure="30ch"
        actions={
          canUpload ? (
            <Link
              href={`/dashboard/team/upload?player=${playerId}`}
              className={advButton("primary")}
            >
              New match
            </Link>
          ) : null
        }
        conditions={conditions}
      />

      <DayZeroShape
        description="Once this player has a match this page shows their season record, serve and return rates, last match, every match by line, and where their serves land. Nothing below is real data yet."
        className="flex flex-col gap-5"
      >
        <KpiStripEmpty />

        <div className="grid items-start gap-4 lg:grid-cols-[1.9fr_1fr]">
          <div className="flex flex-col gap-4">
            <div className="surface-card flex flex-col gap-3.5" style={{ padding: "18px 20px" }}>
              <span className="eyebrow">Last match</span>
              <div className="grid grid-cols-[32px_minmax(0,1fr)_15px_auto] items-center gap-3">
                <span className="size-8 rounded-[var(--radius-button)] bg-[var(--ink-100)]" />
                <span className="flex flex-col gap-1.5">
                  <GhostRule width="40%" tone="200" shape="tall" />
                  <GhostRule width="60%" />
                </span>
                <GhostRule width="14px" shape="dot" />
                <GhostRule width="88px" />
              </div>
            </div>

            <div className="surface-card flex flex-col gap-0.5" style={{ padding: 20 }}>
              <div className="flex items-center pb-3">
                <span className="eyebrow">Match history</span>
              </div>
              <MatchHistoryHeader />
              {GHOST_OPACITY.map((opacity) => (
                <GhostRow
                  key={opacity}
                  grid={HISTORY_GRID}
                  rules={HISTORY_RULES}
                  opacity={opacity}
                  gap="gap-3"
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="surface-card flex flex-col gap-0.5" style={{ padding: 20 }}>
              <div className="flex items-center pb-3">
                <span className="eyebrow">Line history</span>
              </div>
              <LineHistoryHeader />
              <LineHistoryGhostRows opacities={GHOST_OPACITY.slice(0, 3)} />
            </div>

            <ServePlacementCard serve={serve} matchesPlayed={0} isSelf={mode === "self"} />
          </div>
        </div>
      </DayZeroShape>
    </div>
  );
}
