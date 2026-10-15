/**
 * Everything an Ask page loads before it renders: what can be tagged, how
 * many questions are left, the saved conversations and the one that is open.
 *
 * Each loader but the quota takes `programId`: null for the personal page,
 * a program's id for the team one. It is a primitive so `cache()` can key on
 * it. A program id is a selector, not a permission — RLS returns a
 * non-member nothing from `matches`, `program_roster_full` answers them
 * with no rows, and conversations are owner-only whichever workspace they
 * were asked in — and the caller (the team layout, `POST /api/ask`) has
 * already checked membership. The quota is the asker's own in both.
 *
 * Every read goes through the cookie-authenticated server client, never
 * `admin.ts`. `ask_conversations` and `ask_messages` are owner-only under RLS
 * (`20261011191453_ask_conversations.sql`) and `ask_quota()` counts for
 * `auth.uid()`, so the session decides whose rows come back; the explicit
 * `user_id` filters below are belt-and-braces, not the boundary.
 *
 * Each loader is `cache()`d, so the page and anything beneath it that asks
 * again in the same request share one round trip.
 */

import { cache } from "react";
import { isUuid } from "@/lib/admin/validation";
import {
  buildAskTagOptions,
  buildTeamAskTagOptions,
  NO_ASK_TAG_OPTIONS,
  type AskRosterRow,
  type AskTagOptions,
  type DbAskTeamMatch,
} from "@/lib/data/ask-tags";
import { getPersonalMatches } from "@/lib/data/personal-matches-server";
import { resolveRosterSeatIds } from "@/lib/data/match-detail-server";
import { getMatchVideo } from "@/lib/data/match-video-server";
import { getMyPlayerIds, playerSide } from "@/lib/data/player-identity-server";
import { youSeat } from "@/lib/data/viewer-side";
import { readAskVisual, type AskVisual } from "@/lib/services/ask/events";
import {
  readAskFeedbackRow,
  type AskFeedback,
} from "@/lib/services/ask/feedback";
import { createClient } from "@/lib/supabase/server";

export type {
  AskMatchOption,
  AskOpponentHand,
  AskOpponentOption,
  AskPlayerOption,
  AskTagOptions,
} from "@/lib/data/ask-tags";

/** The signed-in user's id, or null. One auth read per request. */
const getViewerId = cache(async function getViewerId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
});

/** `getPersonalMatches()`'s columns plus the schedule link `programSide()` reads. */
const TEAM_MATCH_COLUMNS =
  "id, date, player1_id, player2_id, player1_name, player2_name, created_by, score, tournament_name, round, result, match_type, court_type, verified, duration, opponent_hand, opponent_backhand, event_entry_id";

/**
 * A program's matches and roster as tag options. `program_id = <program>` and
 * nothing else is the team Matches list's own predicate
 * (`scopeToWorkspace()`); who may read those rows is RLS's answer.
 */
async function getTeamAskTagOptions(programId: string): Promise<AskTagOptions> {
  const supabase = await createClient();
  const [matchesRead, rosterRead] = await Promise.all([
    supabase
      .from("matches")
      .select(TEAM_MATCH_COLUMNS)
      .eq("program_id", programId)
      // NULLs last, as `getPersonalMatches()` orders them.
      .order("date", { ascending: false, nullsFirst: false }),
    supabase.rpc("program_roster_full", { p_program_id: programId }),
  ]);
  if (matchesRead.error) {
    throw new Error("Could not load the program's matches", {
      cause: matchesRead.error,
    });
  }
  // Without the roster no side can be decided, and every match would read as
  // nobody's: that is a failed read, not an empty team.
  if (rosterRead.error) {
    throw new Error("Could not load the program's roster", {
      cause: rosterRead.error,
    });
  }
  return buildTeamAskTagOptions(
    (matchesRead.data ?? []) as unknown as DbAskTeamMatch[],
    (rosterRead.data ?? []) as AskRosterRow[],
  );
}

/**
 * What the viewer can tag. Personal (`programId` null): their personal
 * matches and the opponents those name — the same rows `ask.matches` exposes
 * to a personal question. Team: the program's matches, their opponents and
 * the roster players who played them. Empty for a signed-out request, for a
 * scope with no match, and for a `programId` that is not a uuid.
 *
 * Throws when the matches cannot be read: an empty menu would say "there are
 * no matches", which is a different fact.
 */
export const getAskTagOptions = cache(async function getAskTagOptions(
  programId: string | null = null,
  /** The signed-in user's id when the caller already has it (`POST /api/ask`): one auth read, not two. */
  knownViewerId?: string,
): Promise<AskTagOptions> {
  const viewerId = knownViewerId ?? (await getViewerId());
  if (!viewerId) return NO_ASK_TAG_OPTIONS;

  if (programId !== null) {
    if (!isUuid(programId)) return NO_ASK_TAG_OPTIONS;
    return getTeamAskTagOptions(programId);
  }

  const [matches, myPlayerIds] = await Promise.all([
    getPersonalMatches(viewerId),
    getMyPlayerIds(),
  ]);
  return buildAskTagOptions(matches, (match) =>
    playerSide(match, myPlayerIds, viewerId),
  );
});

export interface AskQuota {
  /** Questions spent this UTC month. */
  used: number;
  /** Null for a platform admin: no monthly limit, though every question is still counted. */
  cap: number | null;
  /** `YYYY-MM-DD`, the first day of next month. */
  resetsOn: string;
}

/**
 * The viewer's question count for the current month, from `ask_quota()`.
 *
 * Null when it cannot be read — never a made-up `0 / 20`. This is display
 * only: whether a question may be asked is decided by
 * `ask_reserve_question()` when it is sent, not by this number.
 */
export const getAskQuota = cache(
  async function getAskQuota(): Promise<AskQuota | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("ask_quota");

    if (error) {
      console.error("[ask] could not read the question quota", {
        sqlstate: error.code,
        error: error.message,
      });
      return null;
    }

    const row = data as {
      used?: unknown;
      cap?: unknown;
      resets_on?: unknown;
    } | null;
    if (
      typeof row?.used !== "number" ||
      (typeof row.cap !== "number" && row.cap !== null) ||
      typeof row.resets_on !== "string"
    ) {
      console.error("[ask] ask_quota() answered an unexpected shape");
      return null;
    }
    return { used: row.used, cap: row.cap, resetsOn: row.resets_on };
  },
);

export interface AskConversationSummary {
  id: string;
  title: string;
  /** ISO timestamp of the last exchange. */
  updatedAt: string;
  /** ISO timestamp of the owner's pin, or null: pinned rows lead the rail. */
  pinnedAt: string | null;
}

/** `%`, `_` and `\` as literal characters in an `ilike` pattern. */
function ilikeLiteral(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * The viewer's saved conversations in one workspace, pinned ones first
 * (newest pin first) and then most recently used first: `program_id is
 * null` for the personal page, the program's for a team one, so each lists
 * only its own. Still the viewer's alone — a team conversation is private to
 * the member who asked. Empty on a read failure: the list is the rail's
 * "Earlier questions", and losing it should not take the composer down with
 * it.
 *
 * `q` narrows the list to titles holding that text, case aside — the rail
 * filters what it was handed on its own, so this is for a caller that wants
 * fewer rows over the wire. Blank is no filter.
 */
export const getAskConversations = cache(async function getAskConversations(
  programId: string | null = null,
  q: string = "",
): Promise<AskConversationSummary[]> {
  const viewerId = await getViewerId();
  if (!viewerId) return [];
  if (programId !== null && !isUuid(programId)) return [];

  const supabase = await createClient();
  let mine = supabase
    .from("ask_conversations")
    .select("id, title, updated_at, pinned_at")
    .eq("user_id", viewerId);
  const needle = q.trim();
  if (needle !== "") mine = mine.ilike("title", `%${ilikeLiteral(needle)}%`);
  const { data, error } = await (
    programId === null
      ? mine.is("program_id", null)
      : mine.eq("program_id", programId)
  )
    .order("pinned_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[ask] could not load conversations", {
      error: error.message,
    });
    return [];
  }

  return (
    (data ?? []) as {
      id: string;
      title: string;
      updated_at: string;
      pinned_at: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
    pinnedAt: row.pinned_at ?? null,
  }));
});

export interface AskConversationMessage {
  id: string;
  role: "user" | "assistant";
  /**
   * The saved exchange exactly as `ask_save_exchange()` was handed it —
   * opaque jsonb the database does not validate. Narrow it before rendering.
   */
  content: unknown;
  createdAt: string;
  /** An answer's thumb from its asker (`ask_feedback`); null when there is none. */
  feedback: AskFeedback | null;
  /** The viewer's pin of this answer's visual (`ask_pins`); null when there is none. */
  pinId: string | null;
}

export interface AskConversation extends AskConversationSummary {
  /** Oldest first; within one exchange, the question before its answer. */
  messages: AskConversationMessage[];
}

/**
 * One conversation with its messages in order, or null when there is none
 * the viewer may read — an id that is not a uuid, does not exist, or belongs
 * to someone else all answer the same, so `?c=` cannot be used to probe.
 * So does one asked in the other workspace: a personal conversation is not
 * found from a team page, nor a team one from the personal page or from
 * another program's.
 *
 * Throws when the read itself fails. That is not "no such conversation":
 * answered as null it would tell a player their conversation is gone, and a
 * follow-up asked through `/api/ask` would be refused as not found when
 * asking again would have worked.
 */
export const getAskConversation = cache(async function getAskConversation(
  id: string,
  programId: string | null = null,
  /** The signed-in user's id when the caller already has it (`POST /api/ask`): one auth read, not two. */
  knownViewerId?: string,
): Promise<AskConversation | null> {
  // A malformed `?c=` would otherwise reach Postgres and fail the uuid cast.
  if (!isUuid(id)) return null;
  if (programId !== null && !isUuid(programId)) return null;

  const viewerId = knownViewerId ?? (await getViewerId());
  if (!viewerId) return null;

  const supabase = await createClient();
  const owned = supabase
    .from("ask_conversations")
    .select("id, title, updated_at, pinned_at")
    .eq("id", id)
    .eq("user_id", viewerId);
  const [conversationRead, messagesRead] = await Promise.all([
    (programId === null
      ? owned.is("program_id", null)
      : owned.eq("program_id", programId)
    ).maybeSingle(),
    supabase
      .from("ask_messages")
      // `ask_feedback` is keyed by the message id, so PostgREST embeds it as
      // one object (or null) per message — the answer's thumb, in this read.
      // `ask_pins` points at a message too, as a list (one pin per answer
      // per owner, so at most one row): the answer's pin, for the card under
      // it that says so.
      .select(
        "id, role, content, created_at, ask_feedback(rating, reasons, note), ask_pins(id)",
      )
      .eq("conversation_id", id)
      .eq("user_id", viewerId)
      .order("created_at", { ascending: true })
      // `ask_save_exchange()` inserts a question and its answer in one
      // statement, so the pair shares a `created_at` to the microsecond.
      // "user" sorts after "assistant"; descending puts the question first.
      .order("role", { ascending: false }),
  ]);

  if (conversationRead.error || messagesRead.error) {
    throw new Error("Could not load the conversation", {
      cause: conversationRead.error ?? messagesRead.error,
    });
  }

  const conversation = conversationRead.data as {
    id: string;
    title: string;
    updated_at: string;
    pinned_at: string | null;
  } | null;
  if (!conversation) return null;

  const messages = (messagesRead.data ?? []) as {
    id: string;
    role: "user" | "assistant";
    content: unknown;
    created_at: string;
    ask_feedback: unknown;
    ask_pins: unknown;
  }[];

  return {
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updated_at,
    pinnedAt: conversation.pinned_at ?? null,
    messages: messages.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at,
      feedback: readAskFeedbackRow(row.ask_feedback),
      pinId: readPinId(row.ask_pins),
    })),
  };
});

/** The first pin id in an embedded `ask_pins(id)` list, or null. */
function readPinId(value: unknown): string | null {
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  for (const row of rows) {
    const id = (row as { id?: unknown } | null)?.id;
    if (typeof id === "string" && isUuid(id)) return id;
  }
  return null;
}

// ── Pins ────────────────────────────────────────────────────────────────────

/** One visual block a player kept from an answer (`ask_pins`), as Home draws it. */
export interface AskPin {
  id: string;
  caption: string;
  visual: AskVisual;
  /** ISO timestamp of the pin. */
  createdAt: string;
  /** The conversation it came from, or null once that was deleted. */
  conversationId: string | null;
}

/** Home shows at most this many pins, newest first. */
export const MAX_HOME_ASK_PINS = 3;

/**
 * The viewer's pins in one workspace, newest first, at most
 * `MAX_HOME_ASK_PINS`: `program_id is null` for the personal Home. A pin
 * whose block no longer reads whole (`readAskVisual`) is left out rather
 * than half drawn.
 *
 * Throws when the read fails: the Home region sits in a `WidgetBoundary`,
 * and a failed read is a retry there, not an absent card.
 */
export const getAskPins = cache(async function getAskPins(
  programId: string | null = null,
): Promise<AskPin[]> {
  const viewerId = await getViewerId();
  if (!viewerId) return [];
  if (programId !== null && !isUuid(programId)) return [];

  const supabase = await createClient();
  const mine = supabase
    .from("ask_pins")
    .select("id, caption, visual, created_at, conversation_id")
    .eq("user_id", viewerId);
  const { data, error } = await (
    programId === null
      ? mine.is("program_id", null)
      : mine.eq("program_id", programId)
  )
    .order("created_at", { ascending: false })
    .limit(MAX_HOME_ASK_PINS);
  if (error) {
    throw new Error("Could not load the pinned charts", { cause: error });
  }

  const pins: AskPin[] = [];
  for (const row of (data ?? []) as {
    id: string;
    caption: string;
    visual: unknown;
    created_at: string;
    conversation_id: string | null;
  }[]) {
    const visual = readAskVisual(row.visual);
    if (!visual) continue;
    pins.push({
      id: row.id,
      caption: row.caption,
      visual,
      createdAt: row.created_at,
      conversationId: row.conversation_id,
    });
  }
  return pins;
});

/**
 * Whether a match has statistics yet — for the page the wizard sent back
 * with `?sent=`, which says "being analysed" only while that is so. Read
 * through the signed-in client, so a match the viewer cannot read answers
 * false like any other with no row; the page then shows nothing for it.
 * A failed read answers true: better no notice than a false one.
 */
export async function askMatchHasStats(matchId: string): Promise<boolean> {
  if (!isUuid(matchId)) return true;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("match_stats")
    .select("match_id")
    .eq("match_id", matchId)
    .limit(1);
  if (error) return true;
  return (data?.length ?? 0) > 0;
}

/** How the match page seats the viewer in one match, with a point to check Ask's seat against. */
export interface AskPageSeat {
  /** `youSeat()`'s answer — the seat the match page, and its Video filter, call "you". */
  youIsPlayer1: boolean;
  /** The match's first point and who served it, so Ask's own seat can be read off the same point. */
  pointNumber: number;
  serverIsPlayer1: boolean;
}

/**
 * The match page's seat for each match, for pattern answers' "Watch" links.
 *
 * Ask decides whose side is "mine" with `ask.my_side()`, and the page with
 * `youSeat()` (`viewer-side.ts`). They agree whenever a seat is held by an id
 * that names the viewer or a roster player, and part in fallbacks — a legacy
 * match with no seat ids, a doubles line, a seat held only by a coach's login.
 * A link that set "you" in the page's filters on one of those would open the
 * other player's shots. So the caller compares the two on one real point and
 * links only where they match; this returns the page's half.
 *
 * Read through the signed-in client, so RLS decides which rows come back; a
 * match it cannot read is simply absent, and gets no link. So is a match with
 * no playable video (`getMatchVideo()`, the match page's own test): its link
 * would open Statistics, not the points — every SwingVision match without an
 * added video, and every video whose file has expired.
 */
export async function getAskPageSeats(
  matchIds: readonly string[],
): Promise<Map<string, AskPageSeat>> {
  const seats = new Map<string, AskPageSeat>();
  const ids = matchIds.filter(isUuid);
  if (ids.length === 0) return seats;
  const supabase = await createClient();
  const [{ data: rows, error }, myPlayerIds] = await Promise.all([
    supabase
      .from("matches")
      .select("id, program_id, player1_id, player2_id")
      .in("id", ids),
    getMyPlayerIds(),
  ]);
  if (error || !rows) return seats;
  await Promise.all(
    rows.map(async (row) => {
      const [rosterIds, first, video] = await Promise.all([
        resolveRosterSeatIds(supabase, row),
        supabase
          .from("points")
          .select("point_number, server_is_player1")
          .eq("match_id", row.id)
          .order("point_number", { ascending: true })
          .limit(1)
          .maybeSingle(),
        getMatchVideo(row.id).catch(() => null),
      ]);
      // No served-by on the first point: nothing to check Ask's seat against,
      // so no link (fail closed).
      if (
        !video ||
        first.error ||
        !first.data ||
        typeof first.data.server_is_player1 !== "boolean"
      ) {
        return;
      }
      seats.set(row.id, {
        youIsPlayer1: youSeat(row, myPlayerIds, rosterIds) === "player1",
        pointNumber: first.data.point_number,
        serverIsPlayer1: first.data.server_is_player1,
      });
    }),
  );
  return seats;
}
