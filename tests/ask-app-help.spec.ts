import { expect, test } from "@playwright/test";

import {
  askUploadAccess,
  asksToUpload,
  readAppHelp,
  type AskUploadAccess,
} from "@/lib/services/ask/app-help";
import type { Workspace } from "@/lib/workspace/types";
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
    "How do I upload a match for Maya?",
    "upload a match for Maya Chen please",
    "can I add a video for my team",
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
    "upload a match for maya and tell me her first serve",
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

  const ASK = "I want to upload a match";
  // `readAppHelp` reads access lazily; these hand it a fixed one.
  const as = (access: AskUploadAccess) => () => access;

  test("a program still being confirmed keeps the link, for SwingVision imports", () => {
    // The team upload page still opens; only video waits (`canSubmitVideo`).
    expect(readAppHelp(ASK, TEAM, as({ kind: "pending" }))).toEqual({
      message:
        "ZZ Test Program is still being confirmed, so match video can't be sent yet. SwingVision imports work now.",
      link: {
        href: "/dashboard/team/upload",
        label: "Import from SwingVision",
        kind: "upload",
      },
    });
  });

  test("a player the upload policy keeps out gets the rule and no link", () => {
    expect(
      readAppHelp(
        ASK,
        TEAM,
        as({ kind: "policy", limitedTo: "owner_coaches", staff: false }),
      ),
    ).toEqual({
      message:
        "ZZ Test Program lets only the owner and coaches add matches, so your account can't upload one. A coach can send the match.",
      link: null,
    });
  });

  test("under an owner-only policy a player is sent to the owner, not a coach", () => {
    // Coaches are kept out by the same policy, so "a coach can send it" would
    // send the player to someone who cannot.
    expect(
      readAppHelp(
        ASK,
        TEAM,
        as({ kind: "policy", limitedTo: "owner", staff: false }),
      )?.message,
    ).toBe(
      "ZZ Test Program lets only the owner add matches, so your account can't upload one. The owner can send the match.",
    );
  });

  test("staff the policy keeps out are told the owner can widen it", () => {
    expect(
      readAppHelp(
        ASK,
        TEAM,
        as({ kind: "policy", limitedTo: "owner", staff: true }),
      )?.message,
    ).toBe(
      "ZZ Test Program lets only the owner add matches, so your account can't upload one. The owner can widen it in Team settings.",
    );
  });

  test("a player whose own grant is off, in a program open to everyone", () => {
    expect(
      readAppHelp(
        ASK,
        TEAM,
        as({ kind: "policy", limitedTo: null, staff: false }),
      ),
    ).toEqual({
      message:
        "ZZ Test Program turns uploads on player by player, and yours isn't on yet. A coach can send the match or turn uploads on for you.",
      link: null,
    });
  });

  test('no sentence talks about "this match": none has been chosen', () => {
    for (const access of [
      { kind: "pending" },
      { kind: "policy", limitedTo: "staff", staff: false },
      { kind: "policy", limitedTo: "owner", staff: false },
      { kind: "policy", limitedTo: null, staff: false },
    ] satisfies AskUploadAccess[]) {
      expect(readAppHelp(ASK, TEAM, as(access))?.message).not.toContain(
        "this match",
      );
    }
  });

  test("access is a team matter: a personal question still gets the wizard", () => {
    expect(
      readAppHelp(ASK, PERSONAL_ASK_SCOPE, as({ kind: "pending" }))?.link?.href,
    ).toBe("/dashboard/matches/new?return=ask");
  });

  test("a question about the matches never reads the upload rules", () => {
    let read = false;
    expect(
      readAppHelp("How is my second serve?", TEAM, () => {
        read = true;
        return { kind: "allowed" };
      }),
    ).toBeNull();
    expect(read).toBe(false);
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

test.describe("askUploadAccess", () => {
  // Only the fields the upload rules read; the rest of a workspace is not.
  const team = (over: Partial<Workspace>): Workspace =>
    ({
      kind: "team",
      id: "program-1",
      name: "ZZ Test Program",
      role: "coach",
      uploadPolicy: "staff",
      memberUploadEnabled: false,
      canSubmitVideo: true,
      ...over,
    }) as Workspace;

  test("staff in a confirmed program may upload", () => {
    expect(askUploadAccess(team({}))).toEqual({ kind: "allowed" });
  });

  test("a program still being confirmed is pending, not refused", () => {
    expect(askUploadAccess(team({ canSubmitVideo: false }))).toEqual({
      kind: "pending",
    });
  });

  test("the policy is asked first: a kept-out player is policy even while pending", () => {
    expect(
      askUploadAccess(team({ role: "player", canSubmitVideo: false })),
    ).toEqual({ kind: "policy", limitedTo: "staff", staff: false });
  });

  test("a coach under an owner-only policy is staff the owner can let in", () => {
    expect(askUploadAccess(team({ uploadPolicy: "owner" }))).toEqual({
      kind: "policy",
      limitedTo: "owner",
      staff: true,
    });
  });

  test("open to everyone, a player without their own grant has no limit to name", () => {
    expect(
      askUploadAccess(team({ role: "player", uploadPolicy: "everyone" })),
    ).toEqual({ kind: "policy", limitedTo: null, staff: false });
    expect(
      askUploadAccess(
        team({
          role: "player",
          uploadPolicy: "everyone",
          memberUploadEnabled: true,
        }),
      ),
    ).toEqual({ kind: "allowed" });
  });
});
