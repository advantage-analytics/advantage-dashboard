import type { ReactNode } from "react";
import { PublicReportHeader } from "@/components/public/public-report-header";
import { getSharedMatchData } from "@/lib/data/match-share-server";
import { surname } from "@/lib/data/match-utils";
import { readShareToken, sharedMatchPair } from "@/lib/data/match-share-format";

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
  const data = await getSharedMatchData(readShareToken(token));

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <PublicReportHeader
        crumb={data ? crumbFor(data.match, data.winner) : null}
      />
      <div className="flex h-[calc(100dvh-var(--header-h))] w-full flex-col overflow-hidden bg-white">
        {children}
      </div>
    </div>
  );
}

/**
 * "Moore def. Baek · August 27, 2026", or "Moore vs Baek" when the score does
 * not settle who won (`sharedMatchWinner`).
 */
function crumbFor(
  match: { player1: { name: string }; player2: { name: string }; date: string },
  winner: "player1" | "player2" | null,
): string {
  const pair = sharedMatchPair(
    surname(match.player1.name),
    surname(match.player2.name),
    winner,
  );
  return match.date ? `${pair} · ${match.date}` : pair;
}
