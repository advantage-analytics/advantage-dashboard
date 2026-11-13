/**
 * One player serves every point of an ordinary game. A game whose rows say
 * otherwise is put right by the console itself, with the operations the
 * labeller already has:
 *
 * - `server`: a point's `server` is not the game's. The game's server is
 *   given to every point (game-operations.ts `planGameServer`), and a point
 *   whose strokes then contradict it switches players with it.
 * - `switch`: every point names the game's server, but a point's rows read as
 *   the other player serving — its serving stroke is theirs and the rally
 *   alternates from it. The whole point changes hands (player-swap.ts
 *   `planPlayerSwitch`): every hitter, the winner and ended by.
 * - `serve-hitter`: the same, but the first rally ball is the serve's own
 *   hitter's, so the serve alone was given to the wrong player. Only the
 *   serve strokes take the server; the rally and the winner stand.
 *
 * The game's server is what its points say (operations.ts `gameServer`): the
 * majority, a tie going to the earliest point — which is what the band reads
 * once the labeller has picked a server there, since that writes every point.
 * One stray point at the head of a game never turns the rest of it round, and
 * a game with more than a third of its points served by the other player is
 * left for the labeller: that is two games filed as one, to be split.
 *
 * Tiebreaks rotate and have their own check (tiebreak-serve.ts). A game with
 * no named server, a point with no serve to read, and a serve whose hitter
 * the labeller set are left alone. One fix
 * at a time, in point order; the console runs it again on the rows it leaves.
 * Pure.
 */

import { gameTypeOf, type GameServerPoint } from "./game-operations";
import { liveRows, rowsByGame } from "./game-shift";
import { gameServer, type LabelGame } from "./operations";
import { liveSwapShots } from "./player-swap";
import { gameKey } from "./score";
import { isServeStroke, type LabelSide } from "./session";

export type GameServeFix = { game: LabelGame; server: LabelSide } & (
  | { kind: "server" }
  | { kind: "switch"; pointIds: string[] }
  | { kind: "serve-hitter"; shotIds: string[] }
);

/** A game is put right only while the points off its server are at most one in this many. */
export const MAX_STRAY_SHARE = 3;

/**
 * How a point's rows read against the game's server. `agrees` also where the
 * rows are not this rule's to judge: a serve the labeller gave its hitter (an
 * added stroke, or one whose hitter is off its seed — their word stands, as
 * "Only this shot" says), and a stroke typed a serve after the rally began,
 * which is a mistyped stroke or two points in one and not a serve to re-hand.
 */
function serveReading(
  point: GameServerPoint,
  server: LabelSide,
): "agrees" | "switch" | { serves: string[] } {
  const live = liveSwapShots(point.shots);
  const rallyAt = live.findIndex(
    (shot) => !isServeStroke(shot.stroke) && shot.hitter !== null,
  );
  const rally = rallyAt === -1 ? null : live[rallyAt];
  const serves = live.filter((shot) => isServeStroke(shot.stroke));
  const serve = serves.at(-1);
  if (!serve || serve.hitter === null || serve.hitter === server) {
    return "agrees";
  }
  if (rally && live.indexOf(serve) > rallyAt) return "agrees";
  if (serves.some(labellerSetHitter)) return "agrees";
  // The rally alternates from the serve (or there is none): the whole point
  // was hit the other way round.
  if (!rally || rally.hitter !== serve.hitter) return "switch";
  return {
    serves: serves
      .filter((shot) => shot.hitter !== server)
      .map((shot) => shot.id),
  };
}

/** Whether the stroke's hitter is the labeller's own word, not the seed's. */
function labellerSetHitter(shot: GameServerPoint["shots"][number]): boolean {
  return shot.seed === null || shot.seed.hitter !== shot.hitter;
}

/** The first ordinary game, in point order, whose rows disagree with its server. */
export function gameServeFix(
  points: readonly GameServerPoint[],
): GameServeFix | null {
  for (const live of rowsByGame(liveRows(points)).values()) {
    if (gameTypeOf(live) !== "game") continue;
    const server = gameServer(live);
    if (!server) continue;
    const game = {
      setNumber: live[0].setNumber as number,
      gameNumber: live[0].gameNumber as number,
    };
    const strays = live.filter((point) => point.server !== server).length;
    if (strays > 0) {
      // Half a game served by each player is two games filed as one: the
      // labeller's to split, not a server to force on either half.
      if (strays * MAX_STRAY_SHARE > live.length) continue;
      return { kind: "server", game, server };
    }
    const pointIds: string[] = [];
    const shotIds: string[] = [];
    let off = 0;
    for (const point of live) {
      const reading = serveReading(point, server);
      if (reading === "agrees") continue;
      off += 1;
      if (reading === "switch") pointIds.push(point.id);
      else shotIds.push(...reading.serves);
    }
    // Most of a game hit the other way round is a game whose stored server
    // is wrong (or a tiebreak filed as a game): the labeller's to settle,
    // never a whole game's winners flipped on a page load.
    if (off * MAX_STRAY_SHARE > live.length) continue;
    if (pointIds.length > 0) return { kind: "switch", game, server, pointIds };
    if (shotIds.length > 0) {
      return { kind: "serve-hitter", game, server, shotIds };
    }
  }
  return null;
}

/** What identifies a fix, so the console never runs the same one twice. */
export function gameServeFixKey(fix: GameServeFix): string {
  const what =
    fix.kind === "server"
      ? ""
      : (fix.kind === "switch" ? fix.pointIds : fix.shotIds).join(",");
  return `${fix.kind}:${gameKey(fix.game)}:${fix.server}:${what}`;
}
