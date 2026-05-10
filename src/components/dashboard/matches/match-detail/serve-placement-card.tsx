"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Target } from "lucide-react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import {
  ServePlacementWidget,
  pointToServeDot,
  type ServeDot,
  type ServePointInput,
} from "@/components/dashboard/matches/serve-placement/serve-placement-widget";

export function ServePlacementCard() {
  const { match, points } = useMatchData();

  const { dots, servePoints } = useMemo(() => {
    const d: ServeDot[] = [];
    const sp: ServePointInput[] = [];
    for (const p of points) {
      // firstShot* = played serve, secondShot* = return. See match-points-server.ts.
      const point: ServePointInput = {
        id: p.id,
        serverIsPlayer1: p.serverIsPlayer1,
        firstShotLandingX: p.firstShotLandingX ?? null,
        firstShotLandingY: p.firstShotLandingY ?? null,
        firstShotZone: p.firstShotZone ?? null,
        firstShotSpin: p.firstShotSpin ?? null,
        firstShotType: p.firstShotType ?? null,
        firstShotResult: p.firstShotResult ?? null,
        resultType: p.resultType,
        wonByPlayer1: p.wonByPlayer1,
        setNumber: p.setNumber,
        pointScore: p.pointScore,
        gameScore: p.gameScore,
        secondShotLandingX: p.secondShotLandingX ?? null,
        secondShotLandingY: p.secondShotLandingY ?? null,
        secondShotContactX: p.secondShotContactX ?? null,
        secondShotContactY: p.secondShotContactY ?? null,
        secondShotType: p.secondShotType ?? null,
        secondShotSpin: p.secondShotSpin ?? null,
        secondShotResult: p.secondShotResult ?? null,
        rallyLength: p.rallyLength,
      };
      sp.push(point);
      // Preview dots match fullscreen initial state (Player 1 only).
      if (!point.serverIsPlayer1) continue;
      const dot = pointToServeDot(point);
      if (dot) d.push(dot);
    }
    return { dots: d, servePoints: sp };
  }, [points]);

  const ctxData = useMemo(
    () => ({ player1Name: match.player1.name, player2Name: match.player2.name }),
    [match.player1.name, match.player2.name],
  );

  return (
    <ServePlacementWidget
      dots={dots}
      points={servePoints}
      contextLabel="THIS MATCH"
      ctxData={ctxData}
      overlay={dots.length === 0 ? <EmptyOverlay /> : null}
    />
  );
}

function EmptyOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="surface-card flex flex-col items-center gap-3 rounded-xl px-6 py-5 text-center"
    >
      <Target
        className="size-5 text-[var(--color-text-muted)]"
        strokeWidth={1.5}
        aria-hidden
      />
      <div className="flex flex-col gap-1.5">
        <p className="text-[13px] font-medium text-[var(--color-text-primary)] leading-[1.3]">
          No serve data for this match
        </p>
        <p className="text-[12px] font-normal text-[var(--color-text-muted)] max-w-[240px] leading-[1.5]">
          Serve landing coordinates weren&apos;t captured. Re-export from
          SwingVision with shot tracking enabled to populate this view.
        </p>
        <Link
          href="/dashboard/help"
          className="text-[10px] font-medium uppercase tracking-[1.5px] text-[var(--color-accent-blue)] hover:text-[var(--color-accent-blue-hover)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue-ring)] rounded-sm"
        >
          Upload help
        </Link>
      </div>
    </div>
  );
}
