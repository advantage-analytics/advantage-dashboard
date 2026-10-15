import { expect, test } from "@playwright/test";

import {
  POSTHOG_PROJECT_ID,
  adminAskSummary,
  askerName,
  filterAdminAskFeedback,
  posthogAppOrigin,
  posthogLinks,
  readAdminAskFeedback,
  shortProgramName,
  shortSchoolName,
  sortAdminAskFeedback,
  type DbAdminAskFeedback,
} from "@/lib/data/ask-admin-view";

/**
 * Admin › Ask — the pure half of the feedback reader
 * (`ask-admin-view.ts`): a raw `ask_feedback` row read into the page's
 * shape, the order (down first), the view filter and the PostHog links.
 * Offline.
 */

const ASKER = "303b22e6-3a20-44f2-9c0c-689284890412";
const PROGRAM = "edaf1aa0-0000-4000-8000-000000000001";

const PEOPLE = {
  names: new Map([[ASKER, "Ana Sokolov"]]),
  programs: new Map([[PROGRAM, "Westbrook College"]]),
};

function row(over: Partial<DbAdminAskFeedback> = {}): DbAdminAskFeedback {
  return {
    id: "f1",
    message_id: "m1",
    user_id: ASKER,
    program_id: null,
    rating: "down",
    reasons: ["wrong_numbers", "other"],
    note: "It counted my opponent's aces.",
    created_at: "2026-10-14T21:05:00.000Z",
    updated_at: "2026-10-14T21:06:00.000Z",
    question: {
      text: "How many aces did I hit?",
      tags: [{ kind: "match", id: "x", label: "vs Marcus Hale" }],
    },
    answer: {
      headline: "Four aces, all in the first set.",
      body: "You hit four aces.\n\nThree went down the T.",
      sql: "select aces from ask.stats",
      scopeSql: "select id from ask.matches",
      visual: { kind: "serve", caption: "Where they went." },
      sources: [{ matchId: "x" }],
      mock: false,
    },
    ...over,
  };
}

const ORIGIN = "https://us.posthog.com";

test.describe("readAdminAskFeedback", () => {
  test("reads the thumb, the asker by name, the question, the answer and the SQL", () => {
    const read = readAdminAskFeedback(row(), PEOPLE, ORIGIN);
    expect(read).not.toBeNull();
    expect(read).toMatchObject({
      id: "f1",
      messageId: "m1",
      rating: "down",
      reasons: ["wrong_numbers", "other"],
      note: "It counted my opponent's aces.",
      asker: { id: ASKER, name: "Ana Sokolov" },
      program: null,
      question: {
        text: "How many aces did I hit?",
        tags: [{ kind: "match", label: "vs Marcus Hale" }],
      },
      answer: {
        headline: "Four aces, all in the first set.",
        body: "You hit four aces.\n\nThree went down the T.",
        sql: "select aces from ask.stats",
        scopeSql: "select id from ask.matches",
        visualKind: "serve",
        sourceCount: 1,
        mock: false,
      },
    });
    // No email anywhere in the row.
    expect(JSON.stringify(read)).not.toMatch(/@/);
  });

  test("a team row names its program; an unknown asker is named by id, never an email", () => {
    const read = readAdminAskFeedback(
      row({
        program_id: PROGRAM,
        user_id: "5ddf1688-87f1-44eb-aaa9-93a64c46fdee",
      }),
      PEOPLE,
      ORIGIN,
    );
    expect(read?.program).toEqual({
      id: PROGRAM,
      name: "Westbrook College",
      shortName: "Westbrook College",
    });
    expect(read?.asker.name).toBe("Player 5ddf1688");
  });

  test("a deleted conversation's row stands on its copies", () => {
    const read = readAdminAskFeedback(
      row({
        message_id: null,
        question: "A plain string question",
        answer: {},
      }),
      PEOPLE,
      ORIGIN,
    );
    expect(read?.messageId).toBeNull();
    expect(read?.question.text).toBe("A plain string question");
    expect(read?.answer).toEqual({
      headline: null,
      body: "",
      sql: null,
      scopeSql: null,
      visualKind: null,
      sourceCount: null,
      mock: false,
    });
  });

  test("a row whose verdict does not read is dropped", () => {
    expect(
      readAdminAskFeedback(row({ rating: "meh" }), PEOPLE, ORIGIN),
    ).toBeNull();
  });
});

test.describe("the PostHog links", () => {
  test("the ingest host becomes the app's origin", () => {
    expect(posthogAppOrigin("https://us.i.posthog.com")).toBe(ORIGIN);
    expect(posthogAppOrigin("https://eu.i.posthog.com/")).toBe(
      "https://eu.posthog.com",
    );
    expect(posthogAppOrigin(undefined)).toBe(ORIGIN);
  });

  test("the traces page is filtered to the answer's day; the person page is the asker's", () => {
    const links = posthogLinks(ORIGIN, ASKER, "2026-10-14");
    expect(links.traces).toBe(
      `${ORIGIN}/project/${POSTHOG_PROJECT_ID}/ai-observability/traces?date_from=2026-10-14&date_to=2026-10-15`,
    );
    expect(links.person).toBe(
      `${ORIGIN}/project/${POSTHOG_PROJECT_ID}/person/${ASKER}`,
    );
    // No day: the traces page unfiltered rather than a broken range.
    expect(posthogLinks(ORIGIN, ASKER, null).traces).toBe(
      `${ORIGIN}/project/${POSTHOG_PROJECT_ID}/ai-observability/traces`,
    );
  });

  test("the row carries them, from its created day", () => {
    const read = readAdminAskFeedback(row(), PEOPLE, ORIGIN);
    expect(read?.posthog.traces).toContain("date_from=2026-10-14");
  });
});

test.describe("order and views", () => {
  const rows = [
    readAdminAskFeedback(
      row({
        id: "up-new",
        rating: "up",
        reasons: [],
        note: null,
        updated_at: "2026-10-15T01:00:00Z",
      }),
      PEOPLE,
      ORIGIN,
    )!,
    readAdminAskFeedback(
      row({ id: "down-old", updated_at: "2026-10-13T01:00:00Z" }),
      PEOPLE,
      ORIGIN,
    )!,
    readAdminAskFeedback(
      row({ id: "down-new", updated_at: "2026-10-14T01:00:00Z" }),
      PEOPLE,
      ORIGIN,
    )!,
  ];

  test("down first, newest change first within each", () => {
    expect(sortAdminAskFeedback(rows).map((r) => r.id)).toEqual([
      "down-new",
      "down-old",
      "up-new",
    ]);
  });

  test("the views cut by verdict; All keeps every row", () => {
    expect(filterAdminAskFeedback(rows, "down").map((r) => r.id)).toEqual([
      "down-old",
      "down-new",
    ]);
    expect(filterAdminAskFeedback(rows, "up").map((r) => r.id)).toEqual([
      "up-new",
    ]);
    expect(filterAdminAskFeedback(rows, "all")).toHaveLength(3);
  });
});

test("askerName: first and last, else the id's head", () => {
  expect(askerName(ASKER, " Ana ", "Sokolov")).toBe("Ana Sokolov");
  expect(askerName(ASKER, null, "Sokolov")).toBe("Sokolov");
  expect(askerName(ASKER, "", "")).toBe("Player 303b22e6");
});

test.describe("the Scope column's short program name", () => {
  test("drops the school's generic framing so campuses stay apart", () => {
    expect(shortSchoolName("University of California, San Diego")).toBe(
      "California, San Diego",
    );
    expect(shortSchoolName("University of California, Berkeley")).toBe(
      "California, Berkeley",
    );
    expect(shortSchoolName("Western Kentucky University")).toBe(
      "Western Kentucky",
    );
    expect(shortSchoolName("The Ohio State University")).toBe("Ohio State");
    // Nothing but framing: the name stands.
    expect(shortSchoolName("University")).toBe("University");
  });

  test("marks the squad so a school's two teams stay apart", () => {
    expect(
      shortProgramName("University of California, San Diego", "womens"),
    ).toBe("California, San Diego · W");
    expect(shortProgramName("Riverside Tennis Club", "coed")).toBe(
      "Riverside Tennis Club · Co-ed",
    );
    expect(shortProgramName("Riverside Tennis Club", null)).toBe(
      "Riverside Tennis Club",
    );
  });

  test("a loader-built short name wins over the derived one", () => {
    const read = readAdminAskFeedback(
      row({ program_id: PROGRAM }),
      { ...PEOPLE, shortPrograms: new Map([[PROGRAM, "Westbrook · W"]]) },
      ORIGIN,
    );
    expect(read?.program?.shortName).toBe("Westbrook · W");
  });
});

test.describe("adminAskSummary", () => {
  const rows = (down: number, up: number) => [
    ...Array.from({ length: down }, () => ({ rating: "down" as const })),
    ...Array.from({ length: up }, () => ({ rating: "up" as const })),
  ];

  test("a list under the cap names its total", () => {
    expect(adminAskSummary(rows(2, 1), false)).toBe("3 thumbs · 2 down · 1 up");
    expect(adminAskSummary(rows(1, 0), false)).toBe("1 thumb · 1 down · 0 up");
  });

  test("a capped list never claims a total it does not know", () => {
    const summary = adminAskSummary(rows(150, 50), true);
    expect(summary).toBe("Newest 200 shown · 150 down · 50 up");
    expect(summary).not.toMatch(/^200 thumbs/);
  });
});
