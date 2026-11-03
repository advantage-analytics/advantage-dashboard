import { zonedDayString } from "@/lib/data/match-utils";

/**
 * In-app player messaging ("Message Advantage") — the pure half.
 *
 * Shapes and rules both sides of the thread share: the player's loader
 * (`support-server.ts`, session client, RLS as the player), the admin loader
 * (`support-admin-server.ts`, service role) and the two action files. Imports
 * no client factory and nothing from `next/*`, so `tests/support-view.spec.ts`
 * loads it offline and a `"use client"` component may import it.
 *
 * Tables and RPCs: `supabase/migrations/20261103055820_support_messaging.sql`.
 */

/** `support_messages.topic`, as the CHECK constraint spells it. */
export const SUPPORT_TOPICS = [
  "match",
  "upload",
  "billing",
  "team",
  "idea",
  "other",
] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

/** `support_threads.origin`, as the CHECK constraint spells it. */
export const SUPPORT_ORIGINS = [
  "first_match_feedback",
  "account_menu",
  "match_report",
  "help",
  "admin",
] as const;
export type SupportOrigin = (typeof SUPPORT_ORIGINS)[number];

/** `support_messages.author_role`. Nothing in this phase writes `event`. */
export type SupportAuthorRole = "player" | "staff" | "event";

/** The longest body `send_support_message()` and the CHECK accept. */
export const SUPPORT_MESSAGE_MAX = 4000;

/**
 * The sender's name a staff row shows when `users.first_name` was null at
 * send — the brand, not "The team", so the bubble and the email agree.
 */
export const STAFF_NAME_FALLBACK = "Advantage";

/**
 * One message as the PLAYER may see it. Deliberately without `author_id`,
 * `email_copy_sent_at` and the thread's `staff_read_at`: RLS lets the player
 * read those columns on their own rows, but nothing on their side needs who
 * on staff wrote (beyond the snapshotted first name) or whether we emailed.
 */
export interface SupportMessage {
  id: string;
  authorRole: SupportAuthorRole;
  /** Staff first name snapshotted at send; null on a player row. */
  authorName: string | null;
  body: string;
  topic: SupportTopic | null;
  matchId: string | null;
  createdAt: string;
}

/** The player's thread, without `staff_read_at`. */
export interface SupportThread {
  id: string;
  origin: SupportOrigin;
  lastPlayerMessageAt: string | null;
  lastStaffMessageAt: string | null;
  playerReadAt: string | null;
  createdAt: string;
}

/** A message as staff see it: the player's view plus the private columns. */
export interface AdminSupportMessage extends SupportMessage {
  authorId: string | null;
  emailCopySentAt: string | null;
}

export interface AdminSupportThread extends SupportThread {
  userId: string;
  staffReadAt: string | null;
}

export function isSupportTopic(value: unknown): value is SupportTopic {
  return (
    typeof value === "string" &&
    (SUPPORT_TOPICS as readonly string[]).includes(value)
  );
}

export function isSupportOrigin(value: unknown): value is SupportOrigin {
  return (
    typeof value === "string" &&
    (SUPPORT_ORIGINS as readonly string[]).includes(value)
  );
}

const TOPIC_LABEL: Record<SupportTopic, string> = {
  match: "A match",
  upload: "An upload",
  billing: "Billing",
  team: "My team",
  idea: "An idea",
  other: "Something else",
};

/**
 * The topic chip's words — the one copy; the internal alert email
 * (`templates/internal-activity.ts`) reads it from here. Null for no topic or
 * a value the CHECK would not have let in.
 */
export function topicLabel(topic: string | null | undefined): string | null {
  return isSupportTopic(topic) ? TOPIC_LABEL[topic] : null;
}

const ORIGIN_LABEL: Record<SupportOrigin, string> = {
  first_match_feedback: "First-match feedback",
  account_menu: "Account menu",
  match_report: "Match report",
  help: "Help",
  admin: "Started by Advantage",
};

/** Where the thread was opened from, for the admin list. Unknown → "Unknown". */
export function originLabel(origin: string | null | undefined): string {
  return isSupportOrigin(origin) ? ORIGIN_LABEL[origin] : "Unknown";
}

function momentMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** Who wrote last, from the thread's two stamps. Null when nobody has. */
export function lastAuthorRole(thread: {
  lastPlayerMessageAt: string | null;
  lastStaffMessageAt: string | null;
}): "player" | "staff" | null {
  const player = momentMs(thread.lastPlayerMessageAt);
  const staff = momentMs(thread.lastStaffMessageAt);
  if (player === null && staff === null) return null;
  if (staff === null) return "player";
  if (player === null) return "staff";
  // A tie cannot happen in practice (two inserts, two `now()`s); it reads as
  // the player's, so the thread stays in the queue rather than dropping out.
  return player >= staff ? "player" : "staff";
}

/**
 * Whose move it is, from staff's side: "you" (staff) when the last message is
 * the player's — the admin nav counts exactly those — otherwise "them".
 */
export function waitingOn(thread: {
  lastPlayerMessageAt: string | null;
  lastStaffMessageAt: string | null;
}): "you" | "them" {
  return lastAuthorRole(thread) === "player" ? "you" : "them";
}

/**
 * The player has a staff message they have not opened:
 * `last_staff_message_at > coalesce(player_read_at, '-infinity')`.
 */
export function hasUnreadStaff(thread: {
  lastStaffMessageAt: string | null;
  playerReadAt: string | null;
}): boolean {
  const staff = momentMs(thread.lastStaffMessageAt);
  if (staff === null) return false;
  const read = momentMs(thread.playerReadAt);
  return read === null || staff > read;
}

/** The newer of the two stamps, else the thread's own `created_at`. */
export function threadLastAt(thread: {
  lastPlayerMessageAt: string | null;
  lastStaffMessageAt: string | null;
  createdAt: string;
}): string {
  const role = lastAuthorRole(thread);
  if (role === "player") return thread.lastPlayerMessageAt as string;
  if (role === "staff") return thread.lastStaffMessageAt as string;
  return thread.createdAt;
}

/**
 * One line of a message for a toast or a list row: whitespace collapsed,
 * cut at a word near `max` with an ellipsis.
 */
export function messagePreview(body: string, max = 120): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function previousDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) - 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Split a thread (oldest first) into what the view folds away and what it
 * shows: `recent` is every message from today's and yesterday's day,
 * `earlier` everything before. Order is kept within each half.
 *
 * `today` is a `YYYY-MM-DD` day, or a moment read in `timeZone` (default
 * UTC). A message's day is its `created_at` read in the same zone — pass the
 * viewer's zone from a client component, or the two halves will split at
 * UTC midnight. An unreadable `created_at` stays in `recent`: hiding a
 * message we cannot date is worse than showing one too many.
 */
export function foldOlderDays<T extends { createdAt: string }>(
  messages: readonly T[],
  today: string | Date,
  timeZone = "UTC",
): { earlier: T[]; recent: T[] } {
  const todayDay =
    typeof today === "string" ? today : zonedDayString(today, timeZone);
  const yesterday = previousDay(todayDay);
  const earlier: T[] = [];
  const recent: T[] = [];
  for (const message of messages) {
    const ms = momentMs(message.createdAt);
    const day = ms === null ? null : zonedDayString(new Date(ms), timeZone);
    if (day !== null && day < yesterday) earlier.push(message);
    else recent.push(message);
  }
  return { earlier, recent };
}

/**
 * `send_support_message()`'s refusals as sentences a player can act on. The
 * codes and messages are the migration's; anything else gets the generic line.
 */
export function sendErrorMessage(
  error: { code?: string | null; message?: string | null } | null | undefined,
): string {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  if (message.includes("support_rate_limited")) {
    return "You've sent a lot of messages in the last hour. Please try again a little later.";
  }
  if (code === "42501" && message.includes("match not found")) {
    return "We couldn't find that match on your account. Pick another match, or send without one.";
  }
  if (code === "42501" && message.includes("no signed-in user")) {
    return "You're signed out. Please sign in again to send your message.";
  }
  if (code === "22023" && message.includes("blank")) {
    return "Write a message before sending.";
  }
  if (code === "22023" && message.includes("over 4000")) {
    return "That message is too long. Keep it under 4,000 characters.";
  }
  return "Your message didn't send. Please try again.";
}
