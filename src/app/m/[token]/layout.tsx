import type { ReactNode } from "react";
import { PublicReportHeader } from "@/components/public/public-report-header";
import { getSharedMatchData } from "@/lib/data/match-share-server";
import { surname } from "@/lib/data/match-utils";

/**
 * A shared match report's frame: the public header, then a fixed-height box
 * the report scrolls inside — the same box `dashboard/matches/(detail)/
 * [matchId]/layout.tsx` draws, for the same reason (the rail and the pane
 * scroll independently only under a bounded height).
 *
 * The header's crumb names the match. `getSharedMatchData` is `cache()`d, so
 * this and the page share one read; a token that resolves to nothing gives
 * the header no crumb and the page its not-found pane.
 */
export default async function SharedMatchLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getSharedMatchData(decodeURIComponent(token));

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <PublicReportHeader crumb={data ? crumbFor(data.match) : null} />
      <div className="flex h-[calc(100dvh-var(--header-h))] w-full flex-col overflow-hidden bg-white">
        {children}
      </div>
    </div>
  );
}

/** "Moore def. Baek · August 27, 2026" — or "vs" for a match nobody won. */
function crumbFor(match: {
  player1: { name: string };
  player2: { name: string };
  score: { winner: "player1" | "player2" };
  matchContext?: string;
  date: string;
}): string {
  const unfinished = match.matchContext?.toLowerCase().includes("unfinished");
  const a = surname(match.player1.name);
  const b = surname(match.player2.name);
  const pair = unfinished
    ? `${a} vs ${b}`
    : match.score.winner === "player1"
      ? `${a} def. ${b}`
      : `${b} def. ${a}`;
  return match.date ? `${pair} · ${match.date}` : pair;
}
