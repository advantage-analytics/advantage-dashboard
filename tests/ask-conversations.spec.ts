import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  HAVE_ENV,
  INSUFFICIENT_PRIVILEGE,
  SKIP_REASON,
  type Session,
  createAdminClient,
} from "./fixtures/live-db";
import { clearPoolLeftovers, poolLogins } from "./fixtures/live-db-pool";

/**
 * Saved Ask conversations — `ask_conversations`, `ask_messages` and the two
 * definer functions that write them (`ask_save_exchange`,
 * `ask_delete_conversation`), proven against the live database:
 *
 *  1. A first exchange with no conversation id creates one conversation,
 *     titled from the question, holding one `user` and one `assistant` row.
 *  2. A second exchange naming that id appends two more rows to the same
 *     conversation and bumps `updated_at`.
 *  3. Another signed-in user can neither read the conversation or its
 *     messages (zero rows), append to it (refused), nor delete it (no row
 *     goes, the owner still sees it).
 *  4. Deleting a conversation removes its messages with it.
 *  5. The tables have no write policy: a direct insert as `authenticated` is
 *     a permission error, not an RLS no-op.
 *
 * Run on demand:  npx playwright test ask-conversations
 */

/** Pool slots, prefixed with this spec's name so no other spec draws them. */
const SLOTS = ["ask-conversations-user-a", "ask-conversations-user-b"];

const QUESTION = {
  text: "How did I serve against left-handers this season?",
  tags: [{ kind: "opponent", id: "left-handers" }],
};
const ANSWER = {
  headline: "Your second serve held up better against left-handers.",
  figures: [
    { label: "Second-serve points won", ref: "r1.second_serve_won_pct" },
  ],
  body: "Across the tagged matches the share held above your season average.",
  match_ids: [],
  sql: "select 1",
};
const FOLLOW_UP = { text: "And my first serve?", tags: [] };

test.describe("ask conversations (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient; // service role
  let userA: Session; // the conversation's owner
  let userB: Session; // a stranger to A
  let poolUserIds: string[] = [];

  /** The conversation the first exchange creates; later tests build on it. */
  let conversationId: string;
  let firstUpdatedAt: string;

  async function sweepConversations(userIds: string[]) {
    if (userIds.length === 0) return;
    // Messages cascade from the conversation.
    const swept = await admin
      .from("ask_conversations")
      .delete()
      .in("user_id", userIds);
    if (swept.error) {
      throw new Error(`ask_conversations sweep: ${swept.error.message}`);
    }
  }

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    // A crashed run's threads would otherwise count against the row totals
    // asserted below.
    const leftoverIds = await clearPoolLeftovers(admin, SLOTS);
    await sweepConversations(leftoverIds);

    [userA, userB] = await poolLogins(admin, SLOTS);
    poolUserIds = [userA.userId, userB.userId];
  });

  test.afterAll(async () => {
    if (!admin) return;
    await sweepConversations(poolUserIds);
  });

  test("a first exchange creates one conversation and two messages", async () => {
    const saved = await userA.client.rpc("ask_save_exchange", {
      p_conversation_id: null,
      p_question: QUESTION,
      p_answer: ANSWER,
    });
    expect(saved.error).toBeNull();
    conversationId = saved.data as string;
    expect(conversationId).toMatch(/^[0-9a-f-]{36}$/);

    const conversations = await userA.client
      .from("ask_conversations")
      .select("id, user_id, title, created_at, updated_at")
      .eq("user_id", userA.userId);
    expect(conversations.error).toBeNull();
    expect(conversations.data).toHaveLength(1);
    const row = conversations.data![0];
    expect(row.id).toBe(conversationId);
    expect(row.title).toBe(QUESTION.text);
    firstUpdatedAt = row.updated_at as string;

    const messages = await userA.client
      .from("ask_messages")
      .select("role, user_id, content")
      .eq("conversation_id", conversationId)
      .order("created_at");
    expect(messages.error).toBeNull();
    expect(messages.data).toHaveLength(2);
    expect(messages.data!.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(messages.data!.every((m) => m.user_id === userA.userId)).toBe(true);
    expect(messages.data![0].content).toEqual(QUESTION);
    expect(messages.data![1].content).toEqual(ANSWER);
  });

  test("a second exchange with that id appends two more messages", async () => {
    // Make the clock move so the bump is observable.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const saved = await userA.client.rpc("ask_save_exchange", {
      p_conversation_id: conversationId,
      p_question: FOLLOW_UP,
      p_answer: ANSWER,
    });
    expect(saved.error).toBeNull();
    expect(saved.data).toBe(conversationId);

    const conversations = await userA.client
      .from("ask_conversations")
      .select("id, title, updated_at")
      .eq("user_id", userA.userId);
    expect(conversations.data).toHaveLength(1);
    // The title stays the first question's; only updated_at moves.
    expect(conversations.data![0].title).toBe(QUESTION.text);
    expect(
      new Date(conversations.data![0].updated_at as string).getTime(),
    ).toBeGreaterThan(new Date(firstUpdatedAt).getTime());

    const messages = await userA.client
      .from("ask_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at");
    expect(messages.data).toHaveLength(4);
    expect(messages.data!.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(messages.data![2].content).toEqual(FOLLOW_UP);
  });

  test("another user cannot read the conversation or its messages", async () => {
    const conversations = await userB.client
      .from("ask_conversations")
      .select("id")
      .eq("id", conversationId);
    expect(conversations.error).toBeNull();
    expect(conversations.data).toHaveLength(0);

    const messages = await userB.client
      .from("ask_messages")
      .select("id")
      .eq("conversation_id", conversationId);
    expect(messages.error).toBeNull();
    expect(messages.data).toHaveLength(0);
  });

  test("another user cannot append to the conversation", async () => {
    const saved = await userB.client.rpc("ask_save_exchange", {
      p_conversation_id: conversationId,
      p_question: FOLLOW_UP,
      p_answer: ANSWER,
    });
    expect(saved.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const count = await admin
      .from("ask_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);
    expect(count.count).toBe(4);
  });

  test("another user cannot delete the conversation", async () => {
    const deleted = await userB.client.rpc("ask_delete_conversation", {
      p_id: conversationId,
    });
    expect(deleted.error).toBeNull();
    expect(deleted.data).toBe(false);

    const stillThere = await userA.client
      .from("ask_conversations")
      .select("id")
      .eq("id", conversationId);
    expect(stillThere.data).toHaveLength(1);
  });

  test("a direct insert as authenticated is refused (no write policy)", async () => {
    const conversation = await userA.client
      .from("ask_conversations")
      .insert({ user_id: userA.userId, title: "Hand-rolled" });
    expect(conversation.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const message = await userA.client.from("ask_messages").insert({
      conversation_id: conversationId,
      user_id: userA.userId,
      role: "user",
      content: FOLLOW_UP,
    });
    expect(message.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  test("deleting a conversation removes its messages", async () => {
    const deleted = await userA.client.rpc("ask_delete_conversation", {
      p_id: conversationId,
    });
    expect(deleted.error).toBeNull();
    expect(deleted.data).toBe(true);

    const conversations = await admin
      .from("ask_conversations")
      .select("id")
      .eq("id", conversationId);
    expect(conversations.data).toHaveLength(0);

    const messages = await admin
      .from("ask_messages")
      .select("id")
      .eq("conversation_id", conversationId);
    expect(messages.data).toHaveLength(0);
  });
});
