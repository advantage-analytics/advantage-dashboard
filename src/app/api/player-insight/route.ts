import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { rosterPlayerName } from "@/lib/data/player-profile";
import { getPlayerMatchSides } from "@/lib/data/player-profile-server";
import { buildPlayerInsightPrompt } from "@/lib/data/player-insight";
import {
  loadPlayerSeason,
  type PlayerSeason,
  type PlayerSeasonDeps,
} from "@/lib/data/player-season-server";
import { createLLMObservabilityContext, getLLMStream } from "@/lib/llm/adapter";
import { textStreamResponse } from "@/lib/llm/stream-response";
import { isUuid } from "@/lib/services/match-video/access";
import {
  errorResponse,
  isPlainObject,
  readBoundedJson,
  transportError,
  type HttpResult,
  type MatchVideoHttpError,
} from "@/lib/services/match-video/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The season claim on a team player's profile — the Statistics tab's
 * Advantage Intelligence card (design Q), the profile's counterpart to
 * `/api/team-insight`.
 *
 * Same contract as the two Focus-card routes: one sentence, no digits,
 * streamed as plain text through `textStreamResponse()`; 204 when there is
 * nothing analyzed to make a claim about. The difference is the subject —
 * one player, named in the body — and so the refusals, which are JSON
 * through `errorResponse()` (`{ error, code, detail? }`) rather than the
 * older routes' bare text.
 *
 * ── Who may ask about whom ──────────────────────────────────────────────────
 * The program is the ACTIVE team workspace, read from the workspace cookie by
 * `getWorkspaceContext()`, which already proved the viewer's membership — a
 * program id in the body would be a claim nobody checked, so none is read. The
 * player is resolved on that program's roster through `program_roster_full`
 * as the viewer (`getPlayerMatchSides`, the read the profile page itself
 * makes); an id that names nobody there is a 404, whatever else it names. A
 * personal workspace has no roster, so it is a 404 too — the viewer is
 * signed in, there is simply no such resource for them here.
 *
 * ── No service role ─────────────────────────────────────────────────────────
 * Every read runs as the viewer under RLS. The one service-role read the
 * page's season loader makes — the ball-paths file behind the Lob rows — is
 * not made here: `NO_BALL_PATHS` answers "no file" for every match, so those
 * two rows are unknown in the prompt and simply left out of it. The claim
 * loses nothing it should have had (a lob count is not a season's headline),
 * and the route touches nothing a signed-in member could not read themself.
 *
 * ── Who writes the figures ──────────────────────────────────────────────────
 * The model writes only the claim. The evidence line the card shows is
 * composed by the page from the same fold (`buildSeasonEvidence`), never from
 * this stream; the prompt forbids digits so the two cannot disagree.
 */

/** The codes this route adds to the transport ones in `http.ts`. */
type PlayerInsightRefusalCode =
  "unauthenticated" | "not_a_program" | "player_not_found";

/**
 * `errorResponse()`'s input is typed to the match-video union; the Ask route
 * casts for its own codes the same way. The body shape is the helper's, and
 * that is identical.
 */
function refusal(
  code: PlayerInsightRefusalCode,
  status: number,
  message: string,
  detail: string,
): MatchVideoHttpError {
  return { code, status, message, detail } as unknown as MatchVideoHttpError;
}

function invalid(detail: string): HttpResult<never> {
  return { ok: false, error: transportError("invalid_request", detail) };
}

interface PlayerInsightBody {
  /** A `program_roster_full.player_id`, lower-cased. */
  playerId: string;
}

/**
 * `{ playerId }` and nothing else. An unknown key is refused by name rather
 * than ignored, as every body here is, so a client that starts sending one
 * learns on its first request that it has no effect. A `playerId` that is not
 * a UUID is refused before the roster is read: a roster id is one, and the
 * RPC has nothing to say about anything else.
 */
function parseBody(value: unknown): HttpResult<PlayerInsightBody> {
  if (!isPlainObject(value)) return invalid("body_type");
  for (const key of Object.keys(value)) {
    if (key !== "playerId") return invalid(`unexpected_field:${key}`);
  }
  const playerId = value.playerId;
  if (typeof playerId !== "string") return invalid("player_id_type");
  if (!isUuid(playerId)) return invalid("player_id_not_uuid");
  return { ok: true, value: { playerId: playerId.toLowerCase() } };
}

/**
 * The season loader's one service-role dependency, answered without one: no
 * ball-paths file for any match, so the fold reads every match's lobs as
 * unknown (`lobKeys: null`) — never as "no lobs".
 */
const NO_BALL_PATHS: PlayerSeasonDeps = {
  loadBallPathsBody: async () => ({ ok: true, value: null }),
};

export async function POST(request: Request): Promise<Response> {
  const workspace = await getWorkspaceContext();
  if (!workspace) {
    return errorResponse(
      refusal("unauthenticated", 401, "Sign in to continue.", "no_session"),
    );
  }

  const { active } = workspace;
  if (active.kind !== "team") {
    return errorResponse(
      refusal(
        "not_a_program",
        404,
        "Switch to a team workspace to read a player's season.",
        "personal_workspace",
      ),
    );
  }

  const raw = await readBoundedJson(request);
  if (!raw.ok) return errorResponse(raw.error);
  const parsed = parseBody(raw.value);
  if (!parsed.ok) return errorResponse(parsed.error);

  // The roster, as the viewer, for the WORKSPACE's program — the id the
  // cookie resolved to, never one from the body.
  const sides = await getPlayerMatchSides(active.id, parsed.value.playerId);
  if (!sides) {
    return errorResponse(
      refusal(
        "player_not_found",
        404,
        "This player is not on the roster.",
        "not_on_roster",
      ),
    );
  }

  // The season, folded as the page folds it, minus the file read above. The
  // loader fails closed — a points read that fails throws rather than
  // dropping the match — and a season short one match is not a season to
  // write a claim about, so the throw is the 500 here.
  let season: PlayerSeason;
  try {
    const supabase = await createClient();
    season = await loadPlayerSeason(supabase, sides.own, NO_BALL_PATHS);
  } catch (err) {
    console.error("[player-insight] could not read the season", err);
    return errorResponse(transportError("internal_error", "season_read"));
  }

  // Nothing analyzed, no claim — the same 204 the Focus-card routes answer
  // with, and for the same reason: this only refuses to invent a judgement.
  // The card never asks for a player with nothing analyzed, so this is a
  // race (a match un-analyzed between the page and the request) or a client
  // asking on its own.
  if (season.analyzed === 0) return new Response(null, { status: 204 });

  const { name, firstName } = rosterPlayerName(sides.roster);

  let iterable: AsyncIterable<string>;
  try {
    iterable = await getLLMStream(
      buildPlayerInsightPrompt({
        name,
        firstName,
        matchesPlayed: season.matchesPlayed,
        analyzed: season.analyzed,
        groups: season.groups,
        tallies: season.tallies,
      }),
      [{ role: "user", content: "Generate this player's season insight." }],
      createLLMObservabilityContext(workspace.viewer.id),
      { span: "player.insight" },
    );
  } catch (err) {
    console.error("LLM adapter error:", err);
    return errorResponse(transportError("internal_error", "stream_open"));
  }

  return textStreamResponse(iterable);
}
