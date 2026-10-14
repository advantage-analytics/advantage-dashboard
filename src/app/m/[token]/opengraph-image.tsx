import { getSharedMatchData } from "@/lib/data/match-share-server";
import { formatScoreText, playedSets } from "@/lib/ui/score-format";
import { readShareToken, sharedMatchPair } from "@/lib/data/match-share-format";
import { LINK_CARD_SIZE, linkCard } from "@/lib/og/link-card";

/**
 * The card a shared match link unfurls into (iMessage, Slack, X): who beat
 * whom, the sets, when and where, under the wordmark. Drawn by `linkCard`,
 * the layout every shared link's card uses.
 *
 * A token that resolves to nothing is a 404, never a generic card — the page
 * itself answers "That link isn't valid".
 */
export const alt = "Match report on Advantage";
export const size = LINK_CARD_SIZE;
export const contentType = "image/png";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Image({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getSharedMatchData(readShareToken(token));
  if (!data) return new Response(null, { status: 404 });

  const { match, winner } = data;
  // `winner` comes from the raw score (`sharedMatchWinner`): null for an
  // unscored, level or unfinished match, which reads "A vs B" — never a
  // "def." the score does not support.
  const headline = sharedMatchPair(
    match.player1.name,
    match.player2.name,
    winner,
  );
  // Sets read winner-first, so the line agrees with the headline. The
  // tiebreak slots swap with the games, never apart from them.
  const sets = playedSets(match.score.sets).map((set) =>
    winner === "player2"
      ? {
          player1: set.player2,
          player2: set.player1,
          player1Tiebreak: set.player2Tiebreak,
          player2Tiebreak: set.player1Tiebreak,
        }
      : set,
  );
  const score = formatScoreText(sets);
  const facts = [match.date, match.tournamentName]
    .filter((part) => part && part.trim())
    .join("  ·  ");

  return linkCard({
    headline,
    line: score || undefined,
    facts: facts || undefined,
    kicker: "Match report",
  });
}
