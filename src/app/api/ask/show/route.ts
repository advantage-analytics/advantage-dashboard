/**
 * `POST /api/ask/show` — "Show me": the points behind one of the viewer's
 * saved Ask answers, as the film can play them (roadmap 6.1). A fixed
 * action, never a model-written one: it re-runs ONLY the answer's saved
 * scope (`show.ts`), through the same guarded `ask_run_query` path a
 * question takes, and never the answer's aggregate SQL.
 *
 *   403 cross_origin     not a request from a page this app served
 *   401 unauthenticated  no session
 *   413 / 400            an over-long or malformed body (`{ answerId }` only)
 *   404 not_found        the answer is not the viewer's, or is not an answer
 *   409 no_plan          a mock answer, or one saved without a plan
 *   409 no_points        the scope ran and admitted no point
 *   500 internal_error   the answer could not be read, the service key is
 *                        not configured, the scope would not run, or the
 *                        point rows could not be read
 *   200                  `AskShowResponse` (`show.ts`)
 *
 * Same origin before the session, as `/api/ask` does it. The database is
 * built exactly as that route builds it: `createAskDatabase()` sends the two
 * query functions to the service-role client with THIS request's
 * `auth.getUser()` id as the viewer, and everything else — the saved answer,
 * the point rows, the film's state — is read through the cookie client,
 * where RLS decides. Nothing here adds to `database.ts`'s list.
 */

import { getMatchFilmEntry } from "@/lib/data/match-film-entry-server";
import { getMatchVideo } from "@/lib/data/match-video-server";
import { filmEntryView, NO_FILM_ENTRY } from "@/lib/match-video/film-entry";
import {
  createAskDatabase,
  type AskRpcClient,
} from "@/lib/services/ask/database";
import {
  isRecord,
  numberOrNull,
  stringOrNull,
} from "@/lib/services/ask/events";
import {
  askShowPlanOf,
  readAskShowRequest,
  showAnswerPoints,
  type AskShowDeps,
  type AskShowFilm,
  type AskShowPointRow,
  type AskShowRefusal,
  type AskShowSavedAnswer,
} from "@/lib/services/ask/show";
import {
  checkSameOrigin,
  errorResponse,
  jsonResponse,
  readBoundedJson,
  transportError,
  type MatchVideoHttpError,
} from "@/lib/services/match-video/http";
import { siteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Two scope queries and three reads: well inside this. */
export const maxDuration = 30;

type AskShowCode = "unauthenticated" | "not_found" | "no_plan" | "no_points";

/** As `/api/ask` does it: `errorResponse()` is typed to the match-video codes. */
function refusal(
  code: AskShowCode,
  status: number,
  message: string,
  detail: string,
): MatchVideoHttpError {
  return { code, status, message, detail } as unknown as MatchVideoHttpError;
}

/** The `program_id` of the embedded conversation row, whichever shape PostgREST gave it. */
function programIdOf(embedded: unknown): string | null {
  const row = Array.isArray(embedded) ? embedded[0] : embedded;
  return isRecord(row) && typeof row.program_id === "string"
    ? row.program_id
    : null;
}

export async function POST(request: Request): Promise<Response> {
  const origin = checkSameOrigin(request, [siteUrl()]);
  if (origin) return errorResponse(origin);

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return errorResponse(
      refusal(
        "unauthenticated",
        401,
        "Sign in to show the points.",
        "no_session",
      ),
    );
  }

  const raw = await readBoundedJson(request);
  if (!raw.ok) return errorResponse(raw.error);
  const parsed = readAskShowRequest(raw.value);
  if (!parsed.ok) {
    return errorResponse(transportError("invalid_request", parsed.reason));
  }
  const { answerId } = parsed.value;

  // The two query functions need the service role (`database.ts`). A
  // deployment without the key is refused here, before anything is read.
  let service: AskRpcClient;
  try {
    const admin = createAdminClient();
    service = { rpc: (fn, args) => admin.rpc(fn, args) };
  } catch (error) {
    console.error("[ask-show] the service-role client could not be built", {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(
      transportError("internal_error", "service_role_unavailable"),
    );
  }
  const db = createAskDatabase({
    user: { rpc: (fn, args) => supabase.rpc(fn, args) },
    service,
    viewerId: user.id,
  });

  const deps: AskShowDeps = {
    db,
    // The saved answer, as the viewer's own row: `ask_messages` RLS admits a
    // message only to its asker, inside a conversation they may still read
    // (a team conversation needs the membership). Nothing else is asked.
    async readAnswer(id): Promise<AskShowSavedAnswer | null> {
      const { data, error } = await supabase
        .from("ask_messages")
        .select("id, role, content, ask_conversations(program_id)")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) {
        throw new Error("Could not read the answer", { cause: error });
      }
      const row = data as {
        role: string;
        content: unknown;
        ask_conversations: unknown;
      } | null;
      if (!row || row.role !== "assistant") return null;
      const programId = programIdOf(row.ask_conversations);
      const plan = askShowPlanOf(row.content);
      // No plan is still the viewer's answer: `show.ts` names it `no_plan`
      // rather than "not found".
      return plan
        ? { ...plan, programId }
        : { scopeSql: "", sql: "", mock: false, figureColumns: [], programId };
    },
    // `public.points` through the cookie client: `visible_match_ids()`
    // decides, as it does for the match page's own point list.
    async readPoints(matchId, pointNumbers): Promise<AskShowPointRow[]> {
      const { data, error } = await supabase
        .from("points")
        .select(
          "point_number, set_number, game_number, point_score, game_score, result_type, video_time, duration",
        )
        .eq("match_id", matchId)
        .in("point_number", [...pointNumbers]);
      if (error) {
        throw new Error("Could not read the points", { cause: error });
      }
      return ((data ?? []) as Record<string, unknown>[]).flatMap((row) => {
        const pointNumber = numberOrNull(row.point_number);
        if (pointNumber === null) return [];
        return [
          {
            pointNumber,
            setNumber: numberOrNull(row.set_number),
            gameNumber: numberOrNull(row.game_number),
            pointScore: stringOrNull(row.point_score),
            gameScore: stringOrNull(row.game_score),
            resultType: stringOrNull(row.result_type),
            videoTime: numberOrNull(row.video_time),
            duration: numberOrNull(row.duration),
          },
        ];
      });
    },
    // The film as the Video tab would find it: a playable video (either
    // lineage), else whether the last one expired. Both loaders ask the
    // match's visibility themselves.
    async readFilm(matchId): Promise<AskShowFilm> {
      const video = await getMatchVideo(matchId).catch((cause: unknown) => {
        console.error("[ask-show] could not resolve the video", {
          matchId,
          cause,
        });
        return null;
      });
      if (video) {
        return {
          state: "ready",
          source: video.source === "attachment" ? "attachment" : "job",
          playback: {
            url: video.url,
            expiresAt: video.expiresAt,
            offsetSeconds: video.startTimeSeconds,
            durationSeconds: video.attachment?.durationSeconds ?? null,
          },
        };
      }
      const entry = await getMatchFilmEntry(matchId).catch(() => NO_FILM_ENTRY);
      return filmEntryView(entry) === "expired"
        ? { state: "expired", expiredAt: entry.expiredAt }
        : { state: "none" };
    },
  };

  let outcome: Awaited<ReturnType<typeof showAnswerPoints>>;
  try {
    outcome = await showAnswerPoints(deps, answerId);
  } catch (error) {
    console.error("[ask-show] could not read the answer", {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(transportError("internal_error", "answer_read"));
  }

  if (!outcome.ok) {
    const code: AskShowRefusal = outcome.code;
    switch (code) {
      case "not_found":
        return errorResponse(
          refusal("not_found", 404, outcome.message, "not_yours"),
        );
      case "no_plan":
        return errorResponse(
          refusal("no_plan", 409, outcome.message, "no_plan"),
        );
      case "no_points":
        return errorResponse(
          refusal("no_points", 409, outcome.message, "no_points"),
        );
      case "query_failed":
      case "read_failed":
        console.error("[ask-show] the scope could not be shown", {
          code,
          error: outcome.message,
        });
        return errorResponse(transportError("internal_error", code));
    }
  }

  return jsonResponse(outcome.value);
}
