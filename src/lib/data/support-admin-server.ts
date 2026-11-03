import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { askerName } from "@/lib/data/ask-admin-view";
import { createAdminClient } from "@/lib/supabase/admin";
import { USER_AVATARS_BUCKET } from "@/lib/user/avatar";
import {
  isSupportOrigin,
  isSupportTopic,
  lastAuthorRole,
  threadLastAt,
  waitingOn,
  type AdminSupportMessage,
  type AdminSupportThread,
  type SupportAuthorRole,
  type SupportOrigin,
} from "@/lib/data/support-view";

/**
 * Admin › Messages — every player's support thread, read with the service
 * role: both tables are owner-only under RLS and staff have no policy
 * (`20261103055820_support_messaging`). Every export re-runs
 * `requireAdminOrNotFound()` rather than trusting the layout, as
 * `ask-admin-server.ts` does.
 *
 * Staff writes (`sendStaffMessage`) live in `src/app/admin/messages/actions.ts`.
 */

/** A reading queue, not an archive — the newest threads by last activity. */
export const MAX_ADMIN_SUPPORT_THREADS = 200;

const THREAD_COLUMNS =
  "id, user_id, origin, last_player_message_at, last_staff_message_at, player_read_at, staff_read_at, created_at";

interface DbAdminThread {
  id: string;
  user_id: string;
  origin: string;
  last_player_message_at: string | null;
  last_staff_message_at: string | null;
  player_read_at: string | null;
  staff_read_at: string | null;
  created_at: string;
}

interface DbAdminMessage {
  id: string;
  author_id: string | null;
  author_role: string;
  author_name: string | null;
  body: string;
  topic: string | null;
  match_id: string | null;
  email_copy_sent_at: string | null;
  created_at: string;
}

function readAdminThread(row: DbAdminThread): AdminSupportThread {
  return {
    id: row.id,
    userId: row.user_id,
    origin: isSupportOrigin(row.origin) ? row.origin : "help",
    lastPlayerMessageAt: row.last_player_message_at,
    lastStaffMessageAt: row.last_staff_message_at,
    playerReadAt: row.player_read_at,
    staffReadAt: row.staff_read_at,
    createdAt: row.created_at,
  };
}

export interface AdminSupportThreadRow {
  threadId: string;
  userId: string;
  playerName: string;
  avatarUrl: string | null;
  origin: SupportOrigin;
  /** The newer of the two message stamps, else when the thread was opened. */
  lastAt: string;
  lastAuthorRole: "player" | "staff" | null;
  /** "you" = the last message is the player's: staff owe a reply. */
  waitingOn: "you" | "them";
}

/** Every thread, newest activity first. */
export async function listSupportThreads(): Promise<AdminSupportThreadRow[]> {
  await requireAdminOrNotFound();
  const db = createAdminClient();

  const { data, error } = await db
    .from("support_threads")
    .select(THREAD_COLUMNS)
    // Newest player message first, so a thread waiting on staff is never the
    // one the cap cuts — an old thread with a fresh message would otherwise
    // drop off while the nav still counted it. Re-sorted by last activity
    // below.
    .order("last_player_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(MAX_ADMIN_SUPPORT_THREADS);
  if (error)
    throw new Error(`Could not read support threads: ${error.message}`);
  const threads = ((data ?? []) as DbAdminThread[]).map(readAdminThread);
  if (threads.length === 0) return [];

  const userIds = [...new Set(threads.map((thread) => thread.userId))];
  const { data: users, error: usersError } = await db
    .from("users")
    .select("id, first_name, last_name, avatar_path")
    .in("id", userIds);
  if (usersError) {
    throw new Error(`Could not read players: ${usersError.message}`);
  }
  const people = new Map<string, { name: string; avatarUrl: string | null }>();
  for (const user of (users ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_path: string | null;
  }[]) {
    people.set(user.id, {
      name: askerName(user.id, user.first_name, user.last_name),
      avatarUrl: user.avatar_path
        ? db.storage.from(USER_AVATARS_BUCKET).getPublicUrl(user.avatar_path)
            .data.publicUrl
        : null,
    });
  }

  return threads
    .map((thread) => ({
      threadId: thread.id,
      userId: thread.userId,
      playerName:
        people.get(thread.userId)?.name ?? askerName(thread.userId, null, null),
      avatarUrl: people.get(thread.userId)?.avatarUrl ?? null,
      origin: thread.origin,
      lastAt: threadLastAt(thread),
      lastAuthorRole: lastAuthorRole(thread),
      waitingOn: waitingOn(thread),
    }))
    .sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt));
}

export interface AdminSupportThreadDetail {
  thread: AdminSupportThread;
  /** Oldest first. */
  messages: AdminSupportMessage[];
  player: {
    email: string | null;
    firstName: string | null;
    name: string;
  };
}

/** One thread, every message in it, and the player's address and name. */
export async function getSupportThreadForAdmin(
  threadId: string,
): Promise<AdminSupportThreadDetail | null> {
  await requireAdminOrNotFound();
  const db = createAdminClient();

  const { data: thread, error } = await db
    .from("support_threads")
    .select(THREAD_COLUMNS)
    .eq("id", threadId)
    .maybeSingle();
  if (error) throw new Error(`Could not read the thread: ${error.message}`);
  if (!thread) return null;
  const read = readAdminThread(thread as DbAdminThread);

  const [messages, user] = await Promise.all([
    db
      .from("support_messages")
      .select(
        "id, author_id, author_role, author_name, body, topic, match_id, email_copy_sent_at, created_at",
      )
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true }),
    db
      .from("users")
      .select("email, first_name, last_name")
      .eq("id", read.userId)
      .maybeSingle(),
  ]);
  if (messages.error) {
    throw new Error(`Could not read messages: ${messages.error.message}`);
  }
  if (user.error) {
    throw new Error(`Could not read the player: ${user.error.message}`);
  }
  const person = user.data as {
    email: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;

  return {
    thread: read,
    messages: ((messages.data ?? []) as DbAdminMessage[]).map((row) => ({
      id: row.id,
      authorId: row.author_id,
      authorRole: row.author_role as SupportAuthorRole,
      authorName: row.author_name,
      body: row.body,
      topic: isSupportTopic(row.topic) ? row.topic : null,
      matchId: row.match_id,
      emailCopySentAt: row.email_copy_sent_at,
      createdAt: row.created_at,
    })),
    player: {
      email: person?.email?.trim() || null,
      firstName: person?.first_name?.trim() || null,
      name: askerName(read.userId, person?.first_name, person?.last_name),
    },
  };
}

/**
 * The admin nav's Messages count: threads waiting on staff, i.e. whose last
 * message is the player's (`waitingOn() === "you"`). Read-only. Answers 0 on
 * a read error — a nav badge must not take the console down.
 */
export async function countMessagesForNav(): Promise<number> {
  await requireAdminOrNotFound();
  const { data, error } = await createAdminClient()
    .from("support_threads")
    .select("last_player_message_at, last_staff_message_at")
    .not("last_player_message_at", "is", null);
  if (error) return 0;
  return (
    (data ?? []) as {
      last_player_message_at: string | null;
      last_staff_message_at: string | null;
    }[]
  ).filter(
    (row) =>
      waitingOn({
        lastPlayerMessageAt: row.last_player_message_at,
        lastStaffMessageAt: row.last_staff_message_at,
      }) === "you",
  ).length;
}

/** Staff opened the thread: stamp `staff_read_at`. */
export async function markStaffRead(threadId: string): Promise<void> {
  await requireAdminOrNotFound();
  const { error } = await createAdminClient()
    .from("support_threads")
    .update({ staff_read_at: new Date().toISOString() })
    .eq("id", threadId);
  if (error) {
    throw new Error(`Could not mark the thread read: ${error.message}`);
  }
}
