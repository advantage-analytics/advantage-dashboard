import { expect, test } from "@playwright/test";

import { asksToUpload, readAppHelp } from "@/lib/services/ask/app-help";
import {
  askQuestion,
  type AskDatabase,
  type AskModel,
  type AskQuestionInput,
} from "@/lib/services/ask/ask";
import type { AskEvent } from "@/lib/services/ask/events";
import { PERSONAL_ASK_SCOPE, type AskScope } from "@/lib/services/ask/scope";
import {
  askThreadReducer,
  emptyAskThread,
  parseAskEvent,
} from "@/components/dashboard/ask/use-ask-stream";

/**
 * Questions about using the app ("I want to upload a match") are answered
 * with the page that does it, before the planner runs (`app-help.ts`). On
 * 2026-11-17 the planner refused that exact question in a team workspace,
 * with nothing to click.
 */

const TEAM: AskScope = {
  kind: "team",
  programId: "00000000-0000-4000-8000-0000000000aa",
  programName: "ZZ Test Program",
};

test.describe("asksToUpload", () => {
  for (const question of [
    "I want to upload a match",
    "i want to upload a match",
    "How do I upload a match?",
    "how can I add a video",
    "Upload a match",
    "upload",
    "Upload!",
    "where do I upload",
    "Can I upload my SwingVision file?",
    "I'd like to add another match",
    "how do we send match video",
    "Hi, I want to upload a new match please",
    "add my match video",
    "how to import a swingvision export",
  ]) {
    test(`reads "${question}" as an upload`, () => {
      expect(asksToUpload(question)).toBe(true);
    });
  }

  // Questions about the matches, a video in them, or an upload that happened:
  // the planner's.
  for (const question of [
    "Give me videos of Rudy's aces",
    "How did my uploaded match go?",
    "Show me the video of my last match",
    "How did my match against Jeff go?",
    "add",
    "send",
    "What happened in the match I added last week?",
    "Can I see the best plays and a playlist for each",
    "How do I beat Aidan?",
    "upload a match and tell me my first serve percentage",
  ]) {
    test(`leaves "${question}" to the planner`, () => {
      expect(asksToUpload(question)).toBe(false);
    });
  }
});

test.describe("readAppHelp", () => {
  test("a personal question goes to the wizard with a way back to Ask", () => {
    expect(readAppHelp("I want to upload a match", PERSONAL_ASK_SCOPE)).toEqual(
      {
        message: "You add a match from the upload page.",
        link: {
          href: "/dashboard/matches/new?return=ask",
          label: "Upload a match",
          kind: "upload",
        },
      },
    );
  });

  test("a team question goes to the team's upload page, naming the program", () => {
    expect(readAppHelp("I want to upload a match", TEAM)).toEqual({
      message:
        "Match videos for ZZ Test Program are sent from the upload page.",
      link: {
        href: "/dashboard/team/upload",
        label: "Send match video",
        kind: "upload",
      },
    });
  });

  test("a team viewer who may not upload gets the reason and no link", () => {
    // The same rule the team Ask page hides its own upload button by.
    const refusal =
      "ZZ Test Program is still being confirmed. Video analysis opens as soon as it is.";
    expect(readAppHelp("I want to upload a match", TEAM, refusal)).toEqual({
      message: refusal,
      link: null,
    });
  });

  test("the refusal is a team matter: a personal question still gets the wizard", () => {
    expect(
      readAppHelp("upload a match", PERSONAL_ASK_SCOPE, "A refusal.")?.link
        ?.href,
    ).toBe("/dashboard/matches/new?return=ask");
  });

  test("a question about the matches reads nothing", () => {
    expect(readAppHelp("How is my second serve?", TEAM)).toBeNull();
  });
});

test.describe("askQuestion with an upload question", () => {
  const USAGE_ID = "00000000-0000-4000-8000-0000000000bb";

  function run(question: string, scope: AskScope) {
    const appHelp = readAppHelp(question, scope);
    const calls: string[] = [];
    const db: AskDatabase = {
      rpc: async (fn) => {
        calls.push(fn);
        if (fn === "ask_release_question") return { data: true, error: null };
        throw new Error(`unexpected rpc ${fn}`);
      },
    };
    let modelCalls = 0;
    const model: AskModel = {
      configured: true,
      stream: async () => {
        modelCalls += 1;
        throw new Error("the planner must not run");
      },
    };
    const input = {
      db,
      model,
      now: () => new Date("2026-11-18T15:00:00Z"),
      question,
      tags: { prompt: "", options: [] },
      conversation: [],
      conversationId: null,
      reservation: { usageId: USAGE_ID },
      appHelp,
      scope,
    } as unknown as AskQuestionInput;
    return {
      calls,
      modelCalls: () => modelCalls,
      events: (async () => {
        const out: AskEvent[] = [];
        for await (const event of askQuestion(input)) out.push(event);
        return out;
      })(),
    };
  }

  test("answers with the upload page, makes no model call, and gives the question back", async () => {
    const asked = run("I want to upload a match", TEAM);
    const events = await asked.events;

    expect(events).toEqual([
      { type: "status", stage: "planning" },
      {
        type: "error",
        code: "app_help",
        error:
          "Match videos for ZZ Test Program are sent from the upload page.",
        link: {
          href: "/dashboard/team/upload",
          label: "Send match video",
          kind: "upload",
        },
      },
    ]);
    expect(asked.modelCalls()).toBe(0);
    expect(asked.calls).toEqual(["ask_release_question"]);
  });
});

test.describe("parseAskEvent with an app_help link", () => {
  const line = (link: unknown) =>
    JSON.stringify({
      type: "error",
      code: "app_help",
      error: "You add a match from the upload page.",
      link,
    });

  test("keeps a dashboard link and its kind", () => {
    expect(
      parseAskEvent(
        line({
          href: "/dashboard/matches/new?return=ask",
          label: "Upload a match",
          kind: "upload",
        }),
      ),
    ).toEqual({
      type: "error",
      code: "app_help",
      error: "You add a match from the upload page.",
      link: {
        href: "/dashboard/matches/new?return=ask",
        label: "Upload a match",
        kind: "upload",
      },
    });
  });

  test("drops a kind it does not know, keeping the link", () => {
    const event = parseAskEvent(
      line({ href: "/dashboard/team/roster", label: "Open roster", kind: "x" }),
    );
    expect(event && "link" in event ? event.link : null).toEqual({
      href: "/dashboard/team/roster",
      label: "Open roster",
    });
  });

  for (const href of [
    "https://example.com/dashboard/",
    "//example.com/dashboard/",
    "/dashboard/../admin",
    "/admin",
  ]) {
    test(`drops a link to ${href}`, () => {
      const event = parseAskEvent(line({ href, label: "Go" }));
      expect(event).not.toBeNull();
      expect(event && "link" in event).toBe(false);
    });
  }
});

test.describe("the composer after an app_help answer", () => {
  const QUESTION = { text: "I want to upload a match", tags: [] };

  function answered(code: "app_help" | "cannot_answer") {
    const asked = askThreadReducer(emptyAskThread(), {
      type: "asked",
      id: "asked-1",
      question: QUESTION,
    });
    return askThreadReducer(asked, {
      type: "event",
      event: { type: "error", code, error: "A sentence." },
    });
  }

  test("stays empty: the request was answered, so nothing is put back to resend", () => {
    const state = answered("app_help");
    expect(state.inFlight).toBe(false);
    expect(state.draft.text).toBe("");
  });

  test("a refusal still gives the question back to the composer", () => {
    expect(answered("cannot_answer").draft).toEqual(QUESTION);
  });
});
