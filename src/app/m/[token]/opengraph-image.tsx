import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getSharedMatchData } from "@/lib/data/match-share-server";
import { formatScoreText, playedSets } from "@/lib/ui/score-format";
import { readShareToken, sharedMatchPair } from "@/lib/data/match-share-format";

/**
 * The card a shared match link unfurls into (iMessage, Slack, X): who beat
 * whom, the sets, when and where, under the wordmark.
 *
 * Satori draws a flexbox subset, so every box says `display: flex`, colours
 * are literal (design-system hex, no CSS variables here — there is no
 * stylesheet), and the wordmark is the email PNG rather than the SVG, which
 * uses a mask Satori will not rasterise. The font and the logo are read once
 * at module scope, from the project root; `next.config.ts` traces the font
 * into the route's bundle so a deployed function finds it.
 *
 * A token that resolves to nothing is a 404, never a generic card — the page
 * itself answers "That link isn't valid".
 */
export const alt = "Match report on Advantage";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROUTE_DIR = join(process.cwd(), "src", "app", "m", "[token]");
const interMedium = await readFile(join(ROUTE_DIR, "inter-medium.woff"));
const logoData = await readFile(
  join(process.cwd(), "public", "logos", "logo-email.png"),
  "base64",
);
const logoSrc = `data:image/png;base64,${logoData}`;

// Design-system ink and blue, spelled out because there is no stylesheet.
const INK_900 = "#0D0D0D";
const INK_500 = "#888888";
const BLUE = "#3B82F6";
const SURFACE = "#FFFFFF";

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

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background: SURFACE,
        color: INK_900,
        fontFamily: "Inter",
      }}
    >
      <div style={{ display: "flex" }}>
        {/* 450×81 source, drawn at 40px tall. */}
        <img src={logoSrc} width={222} height={40} alt="" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{
            display: "flex",
            fontSize: 60,
            lineHeight: 1.15,
            letterSpacing: -1.2,
          }}
        >
          {headline}
        </div>
        {score && (
          <div
            style={{
              display: "flex",
              fontSize: 44,
              lineHeight: 1.2,
              color: BLUE,
              letterSpacing: -0.5,
            }}
          >
            {score}
          </div>
        )}
        {facts && (
          <div
            style={{
              display: "flex",
              fontSize: 26,
              lineHeight: 1.3,
              color: INK_500,
            }}
          >
            {facts}
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          fontSize: 22,
          color: INK_500,
          letterSpacing: 0.2,
        }}
      >
        Match report · Advantage
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Inter", data: interMedium, style: "normal", weight: 500 },
      ],
    },
  );
}
