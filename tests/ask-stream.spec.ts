import { expect, test } from "@playwright/test";

import {
  ASK_INTERRUPTED_MESSAGE,
  ASK_REFUSAL_FALLBACK,
  askRequestBody,
  askThreadReducer,
  emptyAskThread,
  exchangesFromMessages,
  parseAskEvent,
  readAskEvents,
  streamAsk,
  type AskQuestion,
  type AskThreadAction,
  type AskThreadState,
} from "@/components/dashboard/ask/use-ask-stream";
import { ndjsonStreamResponse } from "@/lib/llm/stream-response";
import {
  ASK_NO_ADVICE_SENTENCE,
  type AskEvent,
  type AskVisual,
} from "@/lib/services/ask/events";

/**
 * `use-ask-stream.ts` — how the Ask page reads `POST /api/ask`. Offline: the
 * functions under the hook are pure, `streamAsk()` takes its `fetch` as an
 * argument, and the wire is written by the route's own
 * `ndjsonStreamResponse()`, so writer and reader are held to one format.
 *
 * What these guard fails quietly. A reader that treats a network chunk as a
 * line drops the event a chunk boundary happened to cut, and the answer just
 * comes up a figure short. A failed question that is not handed back makes
 * the player retype it. A refusal read as a stream shows nothing at all.
 */

const QUESTION: AskQuestion = {
  text: "How did my second serve hold up against Marcus?",
  tags: [{ kind: "opponent", id: "marcus hale", label: "Marcus Hale" }],
};

const SOURCE = {
  matchId: "match-1",
  opponentName: "Marcus Hale",
  playedOn: "2026-09-14",
  iWon: true,
  scoreText: "6-4 6-3",
  playerName: null,
};

const VISUAL: AskVisual = {
  kind: "bars",
  caption: "Share of points, from 1 match against 22.",
  subjectLabel: "Sep 14 vs. Marcus",
  baselineLabel: "All matches",
  rows: [
    {
      label: "2nd serve points won",
      subject: { value: 55, text: "55%" },
      baseline: { value: 48, text: "48%" },
    },
  ],
};

const ANSWER: AskEvent[] = [
  { type: "status", stage: "planning" },
  { type: "status", stage: "querying" },
  { type: "status", stage: "writing" },
  { type: "headline", text: "Your second serve held up — “très bien”." },
  { type: "figure", label: "2nd serve points won", value: "55%" },
  { type: "figure", label: "All matches", value: "48%" },
  { type: "text", delta: "Against Marcus you won more than half.\n\n" },
  { type: "text", delta: "That is above your average." },
  { type: "sources", matches: [SOURCE] },
  { type: "done", conversationId: "conversation-1", used: 9, cap: 20 },
];

/** The bytes the route would send for these events. */
async function wire(events: AskEvent[]): Promise<Uint8Array> {
  async function* each() {
    yield* events;
  }
  return new Uint8Array(await ndjsonStreamResponse(each()).arrayBuffer());
}

/** A body that delivers `bytes` in chunks of the given sizes, then the rest. */
function chunked(bytes: Uint8Array, sizes: number[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let at = 0;
      for (const size of sizes) {
        if (at >= bytes.length) break;
        controller.enqueue(bytes.slice(at, at + size));
        at += size;
      }
      if (at < bytes.length) controller.enqueue(bytes.slice(at));
      controller.close();
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>) {
  const events: AskEvent[] = [];
  for await (const event of readAskEvents(body)) events.push(event);
  return events;
}

/** Ask `QUESTION` against a stubbed route and return the thread it leaves. */
async function askAgainst(
  respond: () => Response | Promise<Response>,
  from: AskThreadState = emptyAskThread(),
) {
  let state = askThreadReducer(
    { ...from, draft: QUESTION },
    { type: "asked", id: "asked-1", question: QUESTION },
  );
  const sent: { url: string; body: unknown }[] = [];
  const dispatch = (action: AskThreadAction) => {
    state = askThreadReducer(state, action);
  };
  const outcome = await streamAsk(
    { conversationId: from.conversationId, question: QUESTION },
    dispatch,
    {
      fetch: (async (url: RequestInfo | URL, init?: RequestInit) => {
        sent.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return respond();
      }) as typeof fetch,
    },
  );
  return { state, outcome, sent };
}

test.describe("reading the NDJSON body", () => {
  test("one event per chunk reads back as sent", async () => {
    const bytes = await wire(ANSWER);
    expect(await collect(chunked(bytes, [bytes.length]))).toEqual(ANSWER);
  });

  test("events split across network chunks are reassembled", async () => {
    const bytes = await wire(ANSWER);

    // Every chunk size from one byte up: each cuts lines, and the headline's
    // multi-byte characters, in a different place. None may lose an event.
    for (const size of [1, 2, 3, 5, 7, 16, 61, 200]) {
      const sizes = Array.from(
        { length: Math.ceil(bytes.length / size) },
        () => size,
      );
      expect(await collect(chunked(bytes, sizes)), `chunks of ${size}`).toEqual(
        ANSWER,
      );
    }
  });

  test("several events in one chunk, and one event over three", async () => {
    const bytes = await wire(ANSWER);
    const text = new TextDecoder().decode(bytes);
    // Cut inside the fourth line twice; everything before it lands together.
    const fourth = text.split("\n").slice(0, 3).join("\n").length + 1;
    const cut = new TextEncoder().encode(text.slice(0, fourth)).length;

    expect(await collect(chunked(bytes, [cut + 4, 9, 11]))).toEqual(ANSWER);
  });

  test("a last line with no newline is still read", async () => {
    const bytes = await wire(ANSWER);
    expect(await collect(chunked(bytes.slice(0, -1), [40]))).toEqual(ANSWER);
  });

  test("lines that are not events are skipped, not fatal", async () => {
    const noise = new TextEncoder().encode(
      [
        "",
        "not json",
        JSON.stringify({ type: "from-a-newer-server", value: 1 }),
        JSON.stringify({ type: "figure", label: "No value" }),
        JSON.stringify({ type: "headline", text: "Still read." }),
        "",
      ].join("\n"),
    );
    expect(await collect(chunked(noise, [13]))).toEqual([
      { type: "headline", text: "Still read." },
    ]);
  });
});

test.describe("a streamed answer", () => {
  test("lands in the thread, event by event", async () => {
    const bytes = await wire(ANSWER);
    const { state, outcome, sent } = await askAgainst(
      () =>
        new Response(chunked(bytes, [10, 10, 10, 50]), {
          status: 200,
          headers: { "Content-Type": "application/x-ndjson" },
        }),
    );

    expect(outcome).toEqual({
      status: "done",
      conversationId: "conversation-1",
    });
    expect(state.inFlight).toBe(false);
    expect(state.conversationId).toBe("conversation-1");
    expect(state.usage).toEqual({ used: 9, cap: 20 });
    expect(state.draft).toEqual({ text: "", tags: [] });
    expect(state.exchanges).toHaveLength(1);
    expect(state.exchanges[0].question).toEqual(QUESTION);
    expect(state.exchanges[0].answer).toEqual({
      status: "done",
      stage: null,
      headline: "Your second serve held up — “très bien”.",
      figures: [
        { label: "2nd serve points won", value: "55%" },
        { label: "All matches", value: "48%" },
      ],
      visual: null,
      body: "Against Marcus you won more than half.\n\nThat is above your average.",
      noAdvice: false,
      sources: [SOURCE],
      error: null,
      answerId: null,
      feedback: null,
    });

    // A first question names no conversation, and a tag goes as kind and id.
    expect(sent).toEqual([
      {
        url: "/api/ask",
        body: {
          question: QUESTION.text,
          tags: [{ kind: "opponent", id: "marcus hale" }],
        },
      },
    ]);
  });

  test("a follow-up names its conversation", async () => {
    const bytes = await wire(ANSWER);
    const { sent } = await askAgainst(
      () => new Response(chunked(bytes, [64]), { status: 200 }),
      emptyAskThread({ conversationId: "conversation-1" }),
    );
    expect(sent[0].body).toMatchObject({ conversationId: "conversation-1" });
  });

  test("a personal question's body carries no `programId` — the bytes it always was", () => {
    const body = askRequestBody({ conversationId: null, question: QUESTION });
    expect(JSON.stringify(body)).toBe(
      JSON.stringify({
        question: QUESTION.text,
        tags: [{ kind: "opponent", id: "marcus hale" }],
      }),
    );
    // Null is the personal page too, and is left out rather than sent.
    expect(
      JSON.stringify(
        askRequestBody({
          conversationId: "conversation-1",
          question: QUESTION,
          programId: null,
        }),
      ),
    ).toBe(
      JSON.stringify({
        conversationId: "conversation-1",
        question: QUESTION.text,
        tags: [{ kind: "opponent", id: "marcus hale" }],
      }),
    );
  });

  test("a team question names its program, and a player tag goes as kind and id", async () => {
    const question: AskQuestion = {
      text: "  How is Mia serving?  ",
      tags: [{ kind: "player", id: "player-dvorsky", label: "Mia Dvorsky" }],
    };
    expect(
      askRequestBody({
        conversationId: null,
        question,
        programId: "program-1",
      }),
    ).toEqual({
      programId: "program-1",
      question: "How is Mia serving?",
      tags: [{ kind: "player", id: "player-dvorsky" }],
    });

    // And that is what reaches the route.
    const bytes = await wire(ANSWER);
    const sent: unknown[] = [];
    await streamAsk(
      { conversationId: "conversation-1", question, programId: "program-1" },
      () => {},
      {
        fetch: (async (_url: RequestInfo | URL, init?: RequestInit) => {
          sent.push(JSON.parse(String(init?.body)));
          return new Response(chunked(bytes, [64]), { status: 200 });
        }) as typeof fetch,
      },
    );
    expect(sent).toEqual([
      {
        conversationId: "conversation-1",
        programId: "program-1",
        question: "How is Mia serving?",
        tags: [{ kind: "player", id: "player-dvorsky" }],
      },
    ]);
  });

  test("a team answer's sources keep the program's player; a personal one's read null", () => {
    expect(
      parseAskEvent(
        JSON.stringify({
          type: "sources",
          matches: [
            { ...SOURCE, playerName: "Mia Dvorsky" },
            // As a personal answer, or one saved before team scope, has it.
            { matchId: "match-2", opponentName: "Theo Lindqvist" },
          ],
        }),
      ),
    ).toEqual({
      type: "sources",
      matches: [
        { ...SOURCE, playerName: "Mia Dvorsky" },
        {
          matchId: "match-2",
          opponentName: "Theo Lindqvist",
          playedOn: null,
          iWon: null,
          scoreText: null,
          playerName: null,
        },
      ],
    });
  });

  test("a `visual` and a `notice` fold into the answer", async () => {
    const bytes = await wire([
      { type: "status", stage: "writing" },
      { type: "headline", text: "It held up." },
      { type: "figure", label: "2nd serve points won", value: "55%" },
      { type: "visual", visual: VISUAL },
      // The server may send a figure after the block; the answer's layout,
      // not the order of arrival, decides where each is drawn.
      { type: "figure", label: "All matches", value: "48%" },
      { type: "text", delta: "Against Marcus you won more than half." },
      { type: "notice", notice: "no_advice" },
      { type: "sources", matches: [SOURCE] },
      { type: "done", conversationId: "conversation-1", used: 9, cap: 20 },
    ]);
    // Cut small, so the block's one long line arrives in many pieces.
    const { state, outcome } = await askAgainst(
      () => new Response(chunked(bytes, Array(400).fill(7)), { status: 200 }),
    );

    expect(outcome.status).toBe("done");
    expect(state.exchanges[0].answer).toEqual({
      status: "done",
      stage: null,
      headline: "It held up.",
      figures: [
        { label: "2nd serve points won", value: "55%" },
        { label: "All matches", value: "48%" },
      ],
      visual: VISUAL,
      body: "Against Marcus you won more than half.",
      noAdvice: true,
      sources: [SOURCE],
      error: null,
      answerId: null,
      feedback: null,
    });
    // The sentence is the footer's to print: it is never put into the body.
    expect(state.exchanges[0].answer.body).not.toContain(
      ASK_NO_ADVICE_SENTENCE,
    );
  });

  test("the block is in the thread as soon as its event lands", () => {
    let state = askThreadReducer(emptyAskThread(), {
      type: "asked",
      id: "asked-1",
      question: QUESTION,
    });
    expect(state.exchanges[0].answer).toMatchObject({
      visual: null,
      noAdvice: false,
    });
    state = askThreadReducer(state, {
      type: "event",
      event: { type: "visual", visual: VISUAL },
    });
    expect(state.inFlight).toBe(true);
    expect(state.exchanges[0].answer.visual).toEqual(VISUAL);

    // One block per answer: a second never replaces the first.
    state = askThreadReducer(state, {
      type: "event",
      event: {
        type: "visual",
        visual: { kind: "form", caption: "", results: [true] },
      },
    });
    expect(state.exchanges[0].answer.visual).toEqual(VISUAL);
  });

  test("an invalid visual line is ignored and the stream reads on", async () => {
    const line = (value: unknown) => JSON.stringify(value);
    const lines = [
      line({ type: "headline", text: "It held up." }),
      // Not a block: no rows, a percentage out of range, an unknown kind,
      // no `visual` at all.
      line({ type: "visual", visual: { ...VISUAL, rows: [] } }),
      line({
        type: "visual",
        visual: {
          ...VISUAL,
          rows: [
            {
              label: "2nd serve points won",
              subject: { value: 140, text: "140%" },
              baseline: { value: 48, text: "48%" },
            },
          ],
        },
      }),
      line({ type: "visual", visual: { kind: "pie", caption: "No." } }),
      line({ type: "visual" }),
      // A notice this build does not know.
      line({ type: "notice", notice: "from-a-newer-server" }),
      line({ type: "text", delta: "Still read." }),
      line({
        type: "done",
        conversationId: "conversation-1",
        used: 1,
        cap: 20,
      }),
      "",
    ];
    for (const bad of lines.slice(1, 6)) {
      expect(parseAskEvent(bad), bad).toBeNull();
    }

    const bytes = new TextEncoder().encode(lines.join("\n"));
    const { state, outcome } = await askAgainst(
      () => new Response(chunked(bytes, [23]), { status: 200 }),
    );
    expect(outcome.status).toBe("done");
    expect(state.exchanges[0].answer).toMatchObject({
      status: "done",
      headline: "It held up.",
      visual: null,
      body: "Still read.",
      noAdvice: false,
    });
  });

  test("a visual line reads back as the block the route sent", () => {
    expect(
      parseAskEvent(JSON.stringify({ type: "visual", visual: VISUAL })),
    ).toEqual({ type: "visual", visual: VISUAL });
    expect(
      parseAskEvent(JSON.stringify({ type: "notice", notice: "no_advice" })),
    ).toEqual({ type: "notice", notice: "no_advice" });
    expect(
      parseAskEvent(JSON.stringify({ type: "notice", notice: "coach" })),
    ).toEqual({ type: "notice", notice: "coach" });
    // A notice kind the client does not know is dropped, not a failure.
    expect(
      parseAskEvent(JSON.stringify({ type: "notice", notice: "later" })),
    ).toBeNull();
  });

  test("a `coach` notice marks the answer, not the no-advice flag", () => {
    let state = askThreadReducer(emptyAskThread(), {
      type: "asked",
      id: "asked-1",
      question: QUESTION,
    });
    state = askThreadReducer(state, {
      type: "event",
      event: { type: "notice", notice: "coach" },
    });
    expect(state.exchanges[0].answer).toMatchObject({
      coach: true,
      noAdvice: false,
    });
    state = askThreadReducer(state, {
      type: "event",
      event: { type: "notice", notice: "no_advice" },
    });
    expect(state.exchanges[0].answer).toMatchObject({
      coach: true,
      noAdvice: true,
    });
  });

  test("the status line follows the route's real step", () => {
    let state = askThreadReducer(emptyAskThread(), {
      type: "asked",
      id: "asked-1",
      question: QUESTION,
    });
    expect(state.exchanges[0].answer).toMatchObject({
      status: "streaming",
      stage: null,
    });
    for (const stage of ["planning", "querying", "writing"] as const) {
      state = askThreadReducer(state, {
        type: "event",
        event: { type: "status", stage },
      });
      expect(state.exchanges[0].answer.stage).toBe(stage);
      expect(state.inFlight).toBe(true);
    }
  });
});

test.describe("a failed answer", () => {
  test("an `error` event leaves the question text available to the composer", async () => {
    const bytes = await wire([
      { type: "status", stage: "planning" },
      {
        type: "error",
        code: "llm_unavailable",
        error: "Advantage Intelligence is not answering right now.",
      },
    ]);
    const { state, outcome } = await askAgainst(
      () => new Response(chunked(bytes, [17]), { status: 200 }),
    );

    expect(outcome).toEqual({ status: "error" });
    expect(state.inFlight).toBe(false);
    // The composer holds the question again, tags and all.
    expect(state.draft).toEqual(QUESTION);
    // The failed exchange stays, carrying the sentence and the slug.
    expect(state.exchanges).toHaveLength(1);
    expect(state.exchanges[0].answer).toMatchObject({
      status: "error",
      stage: null,
      error: {
        code: "llm_unavailable",
        message: "Advantage Intelligence is not answering right now.",
      },
    });
    // Nothing was saved, so there is no conversation and no count.
    expect(state.conversationId).toBeNull();
    expect(state.usage).toBeNull();
  });

  test("a question started since the failure is not overwritten", () => {
    const next: AskQuestion = { text: "And on break points?", tags: [] };
    let state = askThreadReducer(emptyAskThread(), {
      type: "asked",
      id: "asked-1",
      question: QUESTION,
    });
    state = askThreadReducer(state, { type: "draft", draft: next });
    state = askThreadReducer(state, {
      type: "event",
      event: { type: "error", code: "cannot_answer", error: "No." },
    });
    expect(state.draft).toEqual(next);
  });

  test("a non-200 response surfaces the body's `error` sentence and `code`", async () => {
    const { state, outcome } = await askAgainst(() =>
      Response.json(
        {
          error: "You have used all 20 questions for this month.",
          code: "ask_limit_reached",
          detail: { used: 20, cap: 20, resets_on: "2026-11-01" },
        },
        { status: 429 },
      ),
    );

    expect(outcome).toEqual({ status: "refused" });
    expect(state.refusal).toEqual({
      message: "You have used all 20 questions for this month.",
      code: "ask_limit_reached",
      status: 429,
    });
    expect(state.usage).toEqual({ used: 20, cap: 20 });
    // Nothing was answered: the optimistic row is gone and the question is
    // back in the composer.
    expect(state.exchanges).toEqual([]);
    expect(state.inFlight).toBe(false);
    expect(state.draft).toEqual(QUESTION);
  });

  test("a refusal with no `detail` keeps the count it had", async () => {
    const { state } = await askAgainst(() =>
      Response.json(
        { error: "Sign in to ask a question.", code: "unauthenticated" },
        { status: 401 },
      ),
    );
    expect(state.refusal).toEqual({
      message: "Sign in to ask a question.",
      code: "unauthenticated",
      status: 401,
    });
    expect(state.usage).toBeNull();
  });

  test("a refusal that is not JSON still says something", async () => {
    const { state } = await askAgainst(
      () => new Response("<html>Bad gateway</html>", { status: 502 }),
    );
    expect(state.refusal).toEqual({
      message: ASK_REFUSAL_FALLBACK,
      code: null,
      status: 502,
    });
    expect(state.draft).toEqual(QUESTION);
  });

  test("a refusal clears when the next question is sent", () => {
    let state: AskThreadState = {
      ...emptyAskThread(),
      refusal: { message: "No.", code: "invalid_request", status: 400 },
    };
    state = askThreadReducer(state, {
      type: "asked",
      id: "asked-2",
      question: QUESTION,
    });
    expect(state.refusal).toBeNull();
  });

  test("a stream that ends without `done` is an interruption, not a hang", async () => {
    const bytes = await wire([
      { type: "status", stage: "writing" },
      { type: "headline", text: "Half an answer." },
    ]);
    const { state, outcome } = await askAgainst(
      () => new Response(chunked(bytes, [20]), { status: 200 }),
    );

    expect(outcome).toEqual({ status: "interrupted" });
    expect(state.inFlight).toBe(false);
    expect(state.draft).toEqual(QUESTION);
    expect(state.exchanges[0].answer).toMatchObject({
      status: "error",
      headline: "Half an answer.",
      error: { code: null, message: ASK_INTERRUPTED_MESSAGE },
    });
  });

  test("a connection that never opens is the same interruption", async () => {
    const { state, outcome } = await askAgainst(() => {
      throw new TypeError("fetch failed");
    });
    expect(outcome).toEqual({ status: "interrupted" });
    expect(state.inFlight).toBe(false);
    expect(state.draft).toEqual(QUESTION);
  });
});

test.describe("the thread", () => {
  test("a second send while one is in flight is ignored", () => {
    const first = askThreadReducer(emptyAskThread(), {
      type: "asked",
      id: "asked-1",
      question: QUESTION,
    });
    const second = askThreadReducer(first, {
      type: "asked",
      id: "asked-2",
      question: { text: "Again?", tags: [] },
    });
    expect(second).toBe(first);
  });

  test("an event with nothing in flight changes nothing", () => {
    const idle = emptyAskThread();
    expect(
      askThreadReducer(idle, {
        type: "event",
        event: { type: "headline", text: "Late." },
      }),
    ).toBe(idle);
  });

  test("New question empties the thread and keeps the count", () => {
    const state = askThreadReducer(
      {
        ...emptyAskThread({ conversationId: "conversation-1" }),
        usage: { used: 9, cap: 20 },
        draft: QUESTION,
      },
      { type: "reset" },
    );
    expect(state).toEqual({ ...emptyAskThread(), usage: { used: 9, cap: 20 } });
  });
});

test.describe("a saved conversation", () => {
  test("a saved player tag reopens as one, named by its kind when it has no label", () => {
    const [exchange] = exchangesFromMessages([
      {
        id: "m1",
        role: "user",
        content: {
          text: "How is Mia serving?",
          tags: [
            { kind: "player", id: "player-dvorsky", label: "Mia Dvorsky" },
            { kind: "player", id: "player-sokolov" },
            // Not a kind, and not a property of an object either.
            { kind: "toString", id: "x", label: "Nope" },
          ],
        },
      },
    ]);
    expect(exchange.question.tags).toEqual([
      { kind: "player", id: "player-dvorsky", label: "Mia Dvorsky" },
      { kind: "player", id: "player-sokolov", label: "Player" },
    ]);
  });

  test("pairs each question with the answer after it", () => {
    const exchanges = exchangesFromMessages([
      {
        id: "m1",
        role: "user",
        content: {
          text: QUESTION.text,
          tags: [
            { kind: "opponent", id: "marcus hale", label: "Marcus Hale" },
            { kind: "match", id: "match-1" },
            { kind: "group", id: "left-handers", label: "Left-handers" },
          ],
        },
      },
      {
        id: "m2",
        role: "assistant",
        content: {
          headline: "It held up.",
          figures: [
            { label: "2nd serve points won", value: "55%" },
            { label: "Broken", value: 3 },
          ],
          body: "Against Marcus you won more than half.",
          sources: [SOURCE, { opponentName: "No id" }],
          sql: "select 1",
          scope_sql: "select match_id from ask.matches",
        },
      },
      { id: "m3", role: "user", content: { text: "And on break points?" } },
    ]);

    expect(exchanges).toEqual([
      {
        id: "m1",
        question: {
          text: QUESTION.text,
          tags: [
            { kind: "opponent", id: "marcus hale", label: "Marcus Hale" },
            { kind: "match", id: "match-1", label: "Match" },
          ],
        },
        answer: {
          status: "done",
          stage: null,
          headline: "It held up.",
          figures: [{ label: "2nd serve points won", value: "55%" }],
          visual: null,
          body: "Against Marcus you won more than half.",
          noAdvice: false,
          sources: [SOURCE],
          error: null,
          answerId: "m2",
          feedback: null,
        },
      },
      {
        id: "m3",
        question: { text: "And on break points?", tags: [] },
        answer: {
          status: "done",
          stage: null,
          headline: null,
          figures: [],
          visual: null,
          body: "",
          noAdvice: false,
          sources: null,
          error: null,
          answerId: null,
          feedback: null,
        },
      },
    ]);
  });

  test("a saved answer with a block and the notice reopens with both", () => {
    const [exchange] = exchangesFromMessages([
      { id: "m1", role: "user", content: { text: "What should I work on?" } },
      {
        id: "m2",
        role: "assistant",
        content: {
          headline: "It held up.",
          figures: [],
          visual: VISUAL,
          body: "Against Marcus you won more than half.",
          noAdvice: true,
          sources: [SOURCE],
        },
      },
    ]);
    expect(exchange.answer.visual).toEqual(VISUAL);
    expect(exchange.answer.noAdvice).toBe(true);
    expect(exchange.answer.body).toBe("Against Marcus you won more than half.");
  });

  test("a saved block that no longer reads back is left out, the answer kept", () => {
    const [exchange] = exchangesFromMessages([
      { id: "m1", role: "user", content: { text: "Q" } },
      {
        id: "m2",
        role: "assistant",
        content: {
          headline: "It held up.",
          visual: { kind: "bars", caption: "Half a block" },
          // Only `true` is the notice; anything else is not.
          noAdvice: "yes",
        },
      },
    ]);
    expect(exchange.answer).toMatchObject({
      headline: "It held up.",
      visual: null,
      noAdvice: false,
    });
  });

  test("an answer saved before the block and the notice reads as it was", () => {
    const body = `Against Marcus you won more than half.\n\n${ASK_NO_ADVICE_SENTENCE}`;
    const [exchange] = exchangesFromMessages([
      { id: "m1", role: "user", content: { text: "What should I work on?" } },
      {
        id: "m2",
        role: "assistant",
        content: { headline: "It held up.", body, sources: [SOURCE] },
      },
    ]);
    // Neither key: no block, no notice, and the sentence stays where it was
    // written — in the body, neither stripped nor said again.
    expect(exchange.answer).toEqual({
      status: "done",
      stage: null,
      headline: "It held up.",
      figures: [],
      visual: null,
      body,
      noAdvice: false,
      sources: [SOURCE],
      error: null,
      answerId: "m2",
      feedback: null,
    });
  });

  test("never carries the saved SQL into the thread", () => {
    const [exchange] = exchangesFromMessages([
      { id: "m1", role: "user", content: { text: "Q" } },
      {
        id: "m2",
        role: "assistant",
        content: { headline: "A", sql: "select secret from ask.matches" },
      },
    ]);
    expect(JSON.stringify(exchange)).not.toContain("select secret");
  });

  test("content of any shape reads as an empty message, not a crash", () => {
    for (const content of [null, undefined, 7, [], "plain text", { text: 3 }]) {
      const exchanges = exchangesFromMessages([
        { id: "q", role: "user", content },
        { id: "a", role: "assistant", content },
      ]);
      expect(exchanges).toHaveLength(1);
      expect(exchanges[0].question.tags).toEqual([]);
      expect(exchanges[0].answer.figures).toEqual([]);
      expect(exchanges[0].answer.sources).toBeNull();
    }
    // A bare string is the one non-object a question can sensibly be.
    expect(
      exchangesFromMessages([
        { id: "q", role: "user", content: "plain text" },
      ])[0].question.text,
    ).toBe("plain text");
  });

  test("an answer with no question before it is dropped", () => {
    expect(
      exchangesFromMessages([
        { id: "a", role: "assistant", content: { headline: "Orphan" } },
      ]),
    ).toEqual([]);
  });
});
