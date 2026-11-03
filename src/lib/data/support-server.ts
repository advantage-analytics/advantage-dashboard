import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMatchDayShortYear } from "@/lib/data/match-day";
import { buildScoreString, type MatchScore } from "@/lib/data/match-utils";
import { readMyPlayerIds } from "@/lib/data/opponents-load";
import { viewerSide } from "@/lib/data/viewer-side";
import {
  STAFF_NAME_FALLBACK,
  hasUnreadStaff,
  NO_SUPPORT,
  type SupportUnread,
  isSupportOrigin,
  isSupportTopic,
  messagePreview,
  type SupportAuthorRole,
  type SupportMessage,
  type SupportThread,
} from "@/lib/data/support-view";

/**
 * The player's side of "Message Advantage" — every read runs on the client
 * the caller hands in (the session client), so RLS as the player decides
 * what comes back: their own thread and its messages, nothing else.
 *
 * Columns are listed, never `*`: the player may read `author_id`,
 * `email_copy_sent_at` and `staff_read_at` on their own rows under RLS, but
 * this loader does not hand them on (`SupportMessage`'s doc comment).
 *
 * No service role here, ever — staff reads live in `support-admin-server.ts`.
 */

const THREAD_COLUMNS =
  "id, origin, last_player_message_at, last_staff_message_at, player_read_at, created_at";
const MESSAGE_COLUMNS =
  "id, author_role, author_name, body, topic, match_id, created_at";

interface DbThread {
  id: string;
  origin: string;
  last_player_message_at: string | null;
  last_staff_message_at: string | null;
  player_read_at: string | null;
  created_at: string;
}

interface DbMessage {
  id: string;
  author_role: string;
  author_name: string | null;
  body: string;
  topic: string | null;
  match_id: string | null;
  created_at: string;
}

function readThread(row: DbThread): SupportThread {
  return {
    id: row.id,
    // The CHECK holds origin to the list; "help" is only a type-level guard.
    origin: isSupportOrigin(row.origin) ? row.origin : "help",
    lastPlayerMessageAt: row.last_player_message_at,
    lastStaffMessageAt: row.last_staff_message_at,
    playerReadAt: row.player_read_at,
    createdAt: row.created_at,
  };
}

export function readSupportMessage(row: DbMessage): SupportMessage {
  return {
    id: row.id,
    authorRole: row.author_role as SupportAuthorRole,
    authorName: row.author_name,
    body: row.body,
    topic: isSupportTopic(row.topic) ? row.topic : null,
    matchId: row.match_id,
    createdAt: row.created_at,
  };
}

/** The signed-in player's thread and every message in it, oldest first. */
export async function getSupportThread(
  supabase: SupabaseClient,
): Promise<{ thread: SupportThread; messages: SupportMessage[] } | null> {
  const { data: thread, error } = await supabase
    .from("support_threads")
    .select(THREAD_COLUMNS)
    .maybeSingle();
  if (error) {
    throw new Error("Could not load your messages", { cause: error });
  }
  if (!thread) return null;

  const { data: rows, error: messagesError } = await supabase
    .from("support_messages")
    .select(MESSAGE_COLUMNS)
    .eq("thread_id", (thread as DbThread).id)
    .order("created_at", { ascending: true });
  if (messagesError) {
    throw new Error("Could not load your messages", { cause: messagesError });
  }

  return {
    thread: readThread(thread as DbThread),
    messages: ((rows ?? []) as DbMessage[]).map(readSupportMessage),
  };
}

/** What the shell's unread dot and reply toast need. */
export async function getSupportUnread(
  supabase: SupabaseClient,
): Promise<SupportUnread> {
  const { data: thread, error } = await supabase
    .from("support_threads")
    .select("id, last_staff_message_at, player_read_at")
    .maybeSingle();
  if (error) {
    throw new Error("Could not load your messages", { cause: error });
  }
  if (!thread) return NO_SUPPORT;

  const row = thread as {
    id: string;
    last_staff_message_at: string | null;
    player_read_at: string | null;
  };
  const unreadStaff = hasUnreadStaff({
    lastStaffMessageAt: row.last_staff_message_at,
    playerReadAt: row.player_read_at,
  });
  if (!row.last_staff_message_at) {
    return { hasThread: true, unreadStaff, latestStaff: null };
  }

  const { data: latest, error: latestError } = await supabase
    .from("support_messages")
    .select("author_name, body, match_id, created_at")
    .eq("thread_id", row.id)
    .eq("author_role", "staff")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) {
    throw new Error("Could not load your messages", { cause: latestError });
  }
  const message = latest as {
    author_name: string | null;
    body: string;
    match_id: string | null;
    created_at: string;
  } | null;

  return {
    hasThread: true,
    unreadStaff,
    latestStaff: message
      ? {
          authorName: message.author_name?.trim() || STAFF_NAME_FALLBACK,
          preview: messagePreview(message.body),
          createdAt: message.created_at,
          matchId: message.match_id,
        }
      : null,
  };
}

export interface SupportMatchOption {
  id: string;
  /** "vs. Opponent", from the viewer's seat; both names when it has none. */
  label: string;
  /** "Sep 28", or "Sep 28, 2025" from another year. "" when undated. */
  dayLabel: string;
  /** "6-4, 3-6, 7-5" from the viewer's side; "" with no score. */
  scoreText: string;
}

interface DbRecentMatch {
  id: string;
  date: string | null;
  player1_id: string | null;
  player2_id: string | null;
  player1_name: string | null;
  player2_name: string | null;
  created_by: string | null;
  score: MatchScore | null;
  created_at: string;
}

const RECENT_MATCH_LIMIT = 5;

/**
 * The composer's "About a match" picker: the viewer's five newest matches.
 *
 * "The viewer's" is the rule `send_support_message()` checks a match against
 * — they recorded it, or sit in a seat under either id `my_player_ids()`
 * returns — so every option offered is one the RPC accepts.
 */
export async function getRecentMatchesForSupport(
  supabase: SupabaseClient,
): Promise<SupportMatchOption[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const myPlayerIds = await readMyPlayerIds(supabase);
  const ids = [...new Set([user.id, ...myPlayerIds])];
  const idList = ids.join(",");

  const { data, error } = await supabase
    .from("matches")
    .select(
      "id, date, player1_id, player2_id, player1_name, player2_name, created_by, score, created_at",
    )
    .or(
      `created_by.eq.${user.id},player1_id.in.(${idList}),player2_id.in.(${idList})`,
    )
    // NULLs last, or an undated row would read as the newest match.
    .order("date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(RECENT_MATCH_LIMIT);
  if (error) {
    throw new Error("Could not load your recent matches", { cause: error });
  }

  const rows = (data ?? []) as unknown as DbRecentMatch[];

  return rows.map((row) => {
    const side = viewerSide(row, ids, user.id, row.created_by);
    const p1 = row.player1_name?.trim() || "Player 1";
    const p2 = row.player2_name?.trim() || "Player 2";
    const opponent = side === "player1" ? p2 : side === "player2" ? p1 : null;
    return {
      id: row.id,
      label: opponent ? `vs. ${opponent}` : `${p1} vs. ${p2}`,
      dayLabel: row.date ? formatMatchDayShortYear(row.date) : "",
      scoreText: buildScoreString(row.score, side !== "player2"),
    };
  });
}
