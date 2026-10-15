/**
 * Ask on arrival: the first question about a match, asked for the player
 * who sent it, the moment its video finishes processing
 * (docs/ask-improvement-roadmap.md, 6.2).
 *
 * The question is the one the page's first starter asks about the newest
 * match — "How did my match against X go?", with the match tagged
 * (`askMatchStarter()`) — so the answer is in the rail before the player
 * opens Ask, in the answer cache under the starter's own key, and its
 * headline on the "analysis ready" mail. Personal matches only: a program's
 * match is nobody's "my match", and the coach who sent it is not in it.
 *
 * The caller is the webhook's after() block or the results sweep: no
 * session, no `auth.uid()`. So every write the orchestrator makes as the
 * signed-in user is sent to its `_as` form instead, with the uploader named
 * by the server (`arrivalUserClient()`), and the three service-only calls go
 * where they always go (`createAskDatabase()`). A call with no server-side
 * form is refused, never run as nobody. The question spends nothing: there
 * is no reservation, and the `done` event's count is not read.
 *
 * Once per match (`notification_sends`, key `ask_arrival:<match>`): a
 * redelivered webhook or a resubmitted job must not put a second first
 * answer in the rail. Bounded by the caller's deadline through the model
 * calls' abort signal. Never throws: a null is "no answer", and the mail
 * then goes out as it always has.
 */

import { isUuid } from "@/lib/admin/validation";
import {
  flushPostHogAfterResponse,
  getPostHogServerClient,
} from "@/lib/llm/adapter";
import { buildAskTagOptions } from "@/lib/data/ask-tags";
import type { DbPersonalMatch } from "@/lib/data/personal-matches-server";
import { playerSide } from "@/lib/data/player-identity-server";
import type {
  AskDatabase,
  AskModel,
  AskQuestionInput,
  AskRpcResult,
} from "@/lib/services/ask/ask";
import {
  askCacheKey,
  captureAskAnswer,
  readAskDataVersion,
} from "@/lib/services/ask/cache";
import {
  createAskDatabase,
  type AskRpcClient,
} from "@/lib/services/ask/database";
import type { AskDoneEvent, AskEvent } from "@/lib/services/ask/events";
import { askAdapterModel, askStageModels } from "@/lib/services/ask/model";
import {
  askRunProperties,
  askRunRow,
  recordAskRun,
  type AskRunOptions,
  type AskRunRecord,
} from "@/lib/services/ask/runs";
import { PERSONAL_ASK_SCOPE } from "@/lib/services/ask/scope";
import { askMatchStarter } from "@/lib/services/ask/starters";
import { resolveAskTags } from "@/lib/services/ask/tags";
import type { AdminClient } from "@/lib/supabase/admin";

const LOG = "[ask:arrival]";

/** The most a first question may take when the caller set no deadline (a sweep). */
const ARRIVAL_CAP_MS = 40_000;
/** With less than this left there is no point starting: two model calls do not fit. */
const ARRIVAL_MIN_MS = 8_000;
/** Kept back from the deadline for the save after the model stops. */
const ARRIVAL_HEADROOM_MS = 1_500;

/** What an arrival answer leaves behind: where it is, and the one sentence the mail carries. */
export interface AskArrivalAnswer {
  conversationId: string;
  answerId: string | null;
  headline: string;
  question: string;
}

/** The seams a test replaces; production passes none. */
export interface AskArrivalDeps {
  /** The stream to drain: `recordAskRun()` (which runs `askQuestion()`) by default. */
  ask?: (
    input: AskQuestionInput,
    options: AskRunOptions,
  ) => AsyncGenerator<AskEvent, void, undefined>;
  /** The model: the adapter's, with the deadline's abort signal, by default. */
  model?: AskModel;
  now?: () => number;
}

/**
 * The user-side functions the orchestrator calls, each with the form that
 * takes the user as an argument (`20261015085900_ask_on_arrival_functions`).
 * Closed: a new user-side call gets a `_as` form and a line here, or it is
 * refused below — never run with no user behind it.
 */
const ARRIVAL_USER_CALLS: Readonly<Record<string, string>> = Object.freeze({
  ask_save_exchange_ids: "ask_save_exchange_as",
  ask_record_run: "ask_record_run_as",
  ask_cache_put: "ask_cache_put_as",
  ask_data_version: "ask_data_version_as",
});

/**
 * The "signed-in user" half of the database when there is no session: the
 * same calls, sent to their `_as` forms with the user the server named.
 * `p_user_id` is written last, so nothing upstream can name another. The
 * month's count (`ask_quota`) is not read — no question is spent — and any
 * other call is refused.
 */
export function arrivalUserClient(
  service: AskRpcClient,
  userId: string,
): AskRpcClient {
  return {
    rpc(fn, args) {
      if (Object.hasOwn(ARRIVAL_USER_CALLS, fn)) {
        const forwarded: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(args ?? {})) {
          if (key !== "p_user_id") forwarded[key] = value;
        }
        forwarded.p_user_id = userId;
        return service.rpc(ARRIVAL_USER_CALLS[fn], forwarded);
      }
      if (fn === "ask_quota") {
        return Promise.resolve<AskRpcResult>({ data: null, error: null });
      }
      return Promise.resolve<AskRpcResult>({
        data: null,
        error: {
          code: "42501",
          message: `${fn} has no server-side form; Ask on arrival refuses it`,
        },
      });
    },
  };
}

/** `getPersonalMatches()`'s columns, plus the one that says whose scope the match is in. */
const MATCH_COLUMNS =
  "id, date, player1_id, player2_id, player1_name, player2_name, created_by, score, tournament_name, round, result, match_type, court_type, verified, duration, opponent_hand, opponent_backhand, program_id";

type ArrivalMatch = DbPersonalMatch & { program_id: string | null };

/**
 * Ask the match's first question for its uploader, and say where the answer
 * is. Null whenever there is nothing to ask or no answer came: a program's
 * match, an uploader who is not in it, a match already asked about, mock
 * mode, no time left, or a question that failed. Never throws.
 */
export async function askOnArrival(
  params: {
    supabase: AdminClient;
    jobId: string;
    matchId: string;
    /** Epoch ms by which the caller must be done; the model calls stop before it. */
    deadline?: number;
  },
  deps: AskArrivalDeps = {},
): Promise<AskArrivalAnswer | null> {
  const { supabase, jobId, matchId, deadline } = params;
  const now = deps.now ?? Date.now;
  const where = { jobId, matchId };
  try {
    const budget =
      deadline === undefined
        ? ARRIVAL_CAP_MS
        : Math.min(ARRIVAL_CAP_MS, deadline - now() - ARRIVAL_HEADROOM_MS);
    if (budget < ARRIVAL_MIN_MS) {
      console.warn(`${LOG} no time left for a first question`, {
        ...where,
        budgetMs: budget,
      });
      return null;
    }

    const read = await supabase
      .from("matches")
      .select(MATCH_COLUMNS)
      .eq("id", matchId)
      .maybeSingle();
    if (read.error || !read.data) {
      console.warn(`${LOG} match not readable, no first question`, {
        ...where,
        error: read.error?.message,
      });
      return null;
    }
    const match = read.data as unknown as ArrivalMatch;
    if (match.program_id !== null) {
      console.log(`${LOG} a program's match: no first question`, where);
      return null;
    }
    const uploader = match.created_by;
    if (!uploader || !isUuid(uploader)) {
      console.warn(`${LOG} match has no uploader, no first question`, where);
      return null;
    }
    // The answer is written as the match's creator and its headline goes on
    // the mail to the job's creator: the two must be one person, or one
    // user's private answer would land in another's inbox.
    const job = await supabase
      .from("processing_jobs")
      .select("created_by")
      .eq("id", jobId)
      .maybeSingle();
    const jobOwner = (job.data as { created_by?: unknown } | null)?.created_by;
    if (job.error || jobOwner !== uploader) {
      console.log(`${LOG} job and match have different owners`, where);
      return null;
    }

    // Whose side the uploader is: their login, or a roster profile they
    // claimed — `playerSide()`, the rule `ask.my_side()` restates in SQL.
    const claimed = await supabase
      .from("program_players")
      .select("id")
      .eq("claimed_by_user_id", uploader)
      .is("merged_into_id", null);
    const seats = [
      uploader,
      ...((claimed.data ?? []) as { id: string }[]).map((row) => row.id),
    ];
    const side = playerSide(match, seats, uploader);
    if (side === null) {
      console.warn(`${LOG} uploader is not in the match, no first question`, {
        ...where,
        uploader,
      });
      return null;
    }

    const options = buildAskTagOptions([match], () => side);
    const starter = askMatchStarter(options.matches[0]);
    const resolved = resolveAskTags(
      starter.tags.map(({ kind, id }) => ({ kind, id })),
      options,
      PERSONAL_ASK_SCOPE,
    );
    if (!resolved.ok) {
      console.error(`${LOG} the match tag did not resolve`, {
        ...where,
        reason: resolved.reason,
      });
      return null;
    }

    const signal = AbortSignal.timeout(budget);
    const model = deps.model ?? askAdapterModel({ userId: uploader, signal });
    if (!model.configured) {
      console.log(`${LOG} mock mode: no first question`, where);
      return null;
    }

    if (!(await claimArrival(supabase, matchId))) {
      console.log(`${LOG} already asked for this match`, where);
      return null;
    }

    const service: AskRpcClient = { rpc: (fn, args) => supabase.rpc(fn, args) };
    const db: AskDatabase = createAskDatabase({
      user: arrivalUserClient(service, uploader),
      service,
      viewerId: uploader,
    });

    // The run row (as the uploader) and the `ask_run` event, as the route
    // records them, marked as the server's own question.
    const onRun = async (run: AskRunRecord) => {
      const recorded = await db.rpc("ask_record_run", {
        p_run: askRunRow(run),
      });
      if (recorded.error) {
        console.warn(`${LOG} could not record the run`, {
          ...where,
          sqlstate: recorded.error.code,
          error: recorded.error.message,
        });
      }
      const posthog = getPostHogServerClient();
      if (posthog) {
        posthog.capture({
          distinctId: uploader,
          event: "ask_run",
          properties: {
            ...askRunProperties(run, PERSONAL_ASK_SCOPE),
            trigger: "arrival",
          },
        });
        flushPostHogAfterResponse(posthog);
      }
    };

    const input: AskQuestionInput = {
      db,
      model,
      now: () => new Date(now()),
      question: starter.text,
      tags: resolved.tags,
      conversation: [],
      previousPlan: null,
      conversationId: null,
      reservation: null,
      scope: PERSONAL_ASK_SCOPE,
    };
    const stage = askStageModels();
    const ask = deps.ask ?? recordAskRun;
    const recorded = (run: AskQuestionInput) =>
      ask(run, { onRun, planModel: stage.plan, answerModel: stage.answer });

    // Under the starter's own key, so the page's first click replays this.
    const version = await readAskDataVersion(db, PERSONAL_ASK_SCOPE);
    const events = version
      ? captureAskAnswer(input, recorded, {
          key: askCacheKey({
            question: starter.text,
            tags: resolved.tags,
            scope: PERSONAL_ASK_SCOPE,
          }),
          version,
        })
      : recorded(input);

    let headline: string | null = null;
    let done: AskDoneEvent | null = null;
    let failed: string | null = null;
    for await (const event of events) {
      if (event.type === "headline") headline = event.text;
      else if (event.type === "done") done = event;
      else if (event.type === "error") failed = event.code;
    }
    if (!done || !headline) {
      console.warn(`${LOG} no first answer`, { ...where, code: failed });
      return null;
    }
    console.log(`${LOG} first answer saved`, {
      ...where,
      conversationId: done.conversationId,
    });
    return {
      conversationId: done.conversationId,
      answerId: done.answerId ?? null,
      headline,
      question: starter.text,
    };
  } catch (error) {
    console.error(`${LOG} threw`, {
      ...where,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * One first question per match. The same claim the product mail makes
 * (`claimSend()`), on the caller's client: a conflicting insert is a no-op
 * and returns no row, which is "somebody already asked".
 */
async function claimArrival(
  supabase: AdminClient,
  matchId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("notification_sends")
    .upsert(
      { dedupe_key: `ask_arrival:${matchId}` },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("dedupe_key");
  if (error) {
    console.error(`${LOG} could not claim the first question`, {
      matchId,
      error: error.message,
    });
    return false;
  }
  return (data?.length ?? 0) > 0;
}
