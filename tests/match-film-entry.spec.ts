import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  resolveMatchFilmEntry,
  type FilmEntryDeps,
} from "@/lib/data/match-film-entry-server";
import {
  canTakeFilmAction,
  filmEntryView,
  matchVideoWizardHref,
  NO_FILM_ENTRY,
  type MatchFilmEntry,
} from "@/lib/match-video/film-entry";
import { matchFilmHref } from "@/lib/data/match-video-attachment-server";
import { parseReportView } from "@/components/dashboard/matches/match-detail/report-view";
import { matchVideoError } from "@/lib/match-video/types";
import { transportError } from "@/lib/services/match-video/http";
import type { VisibleMatchRow } from "@/lib/services/match-video/access";
import type { PlaybackAttachmentRow } from "@/lib/services/match-video/playback";

/**
 * The Video view's entry actions and the return that follows a save (T22).
 *
 * Three claims are worth more than the rest, and the file is organised around
 * them:
 *
 *   1. The capability is the SERVER's. Every action drawn comes from
 *      `resolveMatchFilmEntry`, which runs the same `authorizeMatchVideoMutation`
 *      ladder the wizard route and the four API routes run. A viewer who can
 *      watch a match but did not create it gets an empty list — and an empty
 *      list draws nothing, which the component assertions at the bottom pin
 *      down, because "no control" and "a disabled control" are different
 *      screens and only one of them is right.
 *
 *   2. A failure is never an absence. An unreadable attachment state, an
 *      unreachable store and a vanished file all keep `add` off the page.
 *      Folding any of them into "no video for this match" would put an Add
 *      button over a row that is still active, and the next thing in the
 *      container would be a duplicate of a file already there — the exact
 *      fold `playback.ts` refuses at the API layer.
 *
 *   3. The return target is the EXISTING selection contract. `?tab=film`,
 *      through `matchFilmHref` and `parseReportView`, and nothing in T22
 *      spells a second one.
 *
 * The seams are all stubbed: no session, no Supabase, no Azure.
 */

/* -------------------------------------------------------------------------
 * Fixtures
 * ---------------------------------------------------------------------- */

const CREATOR = randomUUID();
const TEAMMATE = randomUUID();
const PROGRAM = randomUUID();

const MATCH = randomUUID();
const TEAM_MATCH = randomUUID();
const VENDOR_MATCH = randomUUID();

const MATCHES: Record<string, VisibleMatchRow> = {
  [MATCH]: {
    id: MATCH,
    created_by: CREATOR,
    program_id: null,
    source_provider: "swing-vision",
  },
  [TEAM_MATCH]: {
    id: TEAM_MATCH,
    created_by: CREATOR,
    program_id: PROGRAM,
    source_provider: "swing-vision",
  },
  [VENDOR_MATCH]: {
    id: VENDOR_MATCH,
    created_by: CREATOR,
    program_id: null,
    source_provider: "splitstep",
  },
};

const ACTIVE_ROW: PlaybackAttachmentRow = {
  id: randomUUID(),
  version: 3,
  offset_seconds: 12,
  confirmed_video_time_seconds: 40.5,
  verified_duration_seconds: 5400,
  verified_content_type: "video/mp4",
  filename: "match.mp4",
  final_blob_key: "attachments/final.mp4",
};

interface Scenario {
  userId?: string | null;
  workspace?: { id: string; kind: "personal" | "team" } | null;
  matchError?: string | null;
  /** `undefined` means "no active attachment". */
  row?: PlaybackAttachmentRow;
  attachmentError?: boolean;
  attachmentThrows?: boolean;
  storageUnreachable?: boolean;
  objectMissing?: boolean;
}

function deps(scenario: Scenario = {}): FilmEntryDeps {
  const userId = scenario.userId === undefined ? CREATOR : scenario.userId;
  return {
    async currentUserId() {
      return userId;
    },
    async loadVisibleMatch(matchId) {
      if (scenario.matchError) {
        return { match: null, error: scenario.matchError };
      }
      return { match: MATCHES[matchId] ?? null, error: null };
    },
    async activeWorkspace() {
      if (scenario.workspace === null) return null;
      return (
        scenario.workspace ?? {
          id: userId ?? CREATOR,
          kind: "personal" as const,
        }
      );
    },
    async loadActiveAttachment() {
      if (scenario.attachmentThrows) throw new Error("connection reset");
      if (scenario.attachmentError) {
        return {
          ok: false,
          error: transportError("internal_error", "attachment_read_failed"),
        };
      }
      return { ok: true, value: scenario.row ?? null };
    },
    async finalObjectExists() {
      if (scenario.storageUnreachable) {
        return {
          ok: false,
          error: matchVideoError("storage_unavailable", "head_failed"),
        };
      }
      return { ok: true, value: !scenario.objectMissing };
    },
  };
}

/* -------------------------------------------------------------------------
 * 1. Entry paths — who is offered what
 * ---------------------------------------------------------------------- */

test("a creator with no video is offered exactly one entry: add", async () => {
  const entry = await resolveMatchFilmEntry(MATCH, deps());
  expect(entry).toEqual({
    attachment: "absent",
    actions: ["add"],
    problem: null,
  });
  expect(filmEntryView(entry)).toBe("empty");
});

test("a creator with a video is offered replace and adjust, never add", async () => {
  const entry = await resolveMatchFilmEntry(MATCH, deps({ row: ACTIVE_ROW }));
  expect(entry.attachment).toBe("present");
  expect([...entry.actions].sort()).toEqual(["align", "replace"]);
  expect(canTakeFilmAction(entry, "add")).toBe(false);
  expect(entry.problem).toBeNull();
});

test("a team creator is judged in THAT program's workspace", async () => {
  const inProgram = await resolveMatchFilmEntry(
    TEAM_MATCH,
    deps({ workspace: { id: PROGRAM, kind: "team" } }),
  );
  expect(inProgram.actions).toEqual(["add"]);

  // The same person, same match, wrong workspace: the state is still readable,
  // the actions are not theirs to take here.
  const inPersonal = await resolveMatchFilmEntry(
    TEAM_MATCH,
    deps({ workspace: { id: CREATOR, kind: "personal" } }),
  );
  expect(inPersonal.actions).toEqual([]);
  expect(inPersonal.attachment).toBe("absent");
});

test("a vendor-analysed match offers nothing, even to its own creator", async () => {
  const entry = await resolveMatchFilmEntry(VENDOR_MATCH, deps());
  expect(entry.actions).toEqual([]);
});

/* -------------------------------------------------------------------------
 * 2. Read-only viewers
 * ---------------------------------------------------------------------- */

test("a visible non-creator sees the state and NO action", async () => {
  const withVideo = await resolveMatchFilmEntry(
    MATCH,
    deps({ userId: TEAMMATE, row: ACTIVE_ROW }),
  );
  expect(withVideo.attachment).toBe("present");
  expect(withVideo.actions).toEqual([]);

  // And the empty case, which is the one that could have carried an invitation.
  const without = await resolveMatchFilmEntry(
    MATCH,
    deps({ userId: TEAMMATE }),
  );
  expect(without.attachment).toBe("absent");
  expect(without.actions).toEqual([]);
  for (const action of ["add", "replace", "align"] as const) {
    expect(canTakeFilmAction(without, action), action).toBe(false);
  }
});

test("a signed-out or invisible viewer learns nothing at all", async () => {
  expect(await resolveMatchFilmEntry(MATCH, deps({ userId: null }))).toEqual(
    NO_FILM_ENTRY,
  );
  expect(await resolveMatchFilmEntry(randomUUID(), deps())).toEqual(
    NO_FILM_ENTRY,
  );
  // A malformed id is refused before any read, exactly as the shared ladder
  // refuses it everywhere else.
  expect(await resolveMatchFilmEntry("not-a-uuid", deps())).toEqual(
    NO_FILM_ENTRY,
  );
});

test("nothing is offered before the attachment state has actually been read", async () => {
  // The only branch that may produce `add` is the one that read the row and
  // was told there is none. Every other path must fall short of it.
  const offeringAdd: MatchFilmEntry[] = [];
  for (const scenario of [
    {},
    { attachmentError: true },
    { attachmentThrows: true },
    { row: ACTIVE_ROW },
    { row: ACTIVE_ROW, objectMissing: true },
    { row: ACTIVE_ROW, storageUnreachable: true },
  ] as Scenario[]) {
    const entry = await resolveMatchFilmEntry(MATCH, deps(scenario));
    if (canTakeFilmAction(entry, "add")) offeringAdd.push(entry);
  }
  expect(offeringAdd).toEqual([
    { attachment: "absent", actions: ["add"], problem: null },
  ]);
});

/* -------------------------------------------------------------------------
 * 3. A failure is never an absence
 * ---------------------------------------------------------------------- */

test("an unreadable attachment state is a retryable error, not an empty room", async () => {
  for (const scenario of [
    { attachmentError: true },
    { attachmentThrows: true },
  ] as Scenario[]) {
    const entry = await resolveMatchFilmEntry(MATCH, deps(scenario));
    expect(entry.problem).toBe("storage_unavailable");
    // Not `absent`: the state is unknown, and "unknown" must never render as
    // "there is no video here".
    expect(entry.attachment).toBeNull();
    expect(entry.actions).toEqual([]);
    expect(filmEntryView(entry)).toBe("unavailable");
  }
});

test("a failed match read is an error rather than an invitation", async () => {
  const entry = await resolveMatchFilmEntry(
    MATCH,
    deps({ matchError: "connection terminated" }),
  );
  expect(entry).toEqual({
    attachment: null,
    actions: [],
    problem: "storage_unavailable",
  });
  expect(filmEntryView(entry)).toBe("unavailable");
});

test("an unreachable store over a live attachment stays retryable", async () => {
  const entry = await resolveMatchFilmEntry(
    MATCH,
    deps({ row: ACTIVE_ROW, storageUnreachable: true }),
  );
  expect(entry.problem).toBe("storage_unavailable");
  expect(entry.attachment).toBe("present");
  expect(filmEntryView(entry)).toBe("unavailable");
  // The repairs stay available — neither can create a second attachment.
  expect([...entry.actions].sort()).toEqual(["align", "replace"]);
  expect(canTakeFilmAction(entry, "add")).toBe(false);
});

test("a vanished final object is stale, which is not a state a retry fixes", async () => {
  const entry = await resolveMatchFilmEntry(
    MATCH,
    deps({ row: ACTIVE_ROW, objectMissing: true }),
  );
  expect(entry.problem).toBe("stale_attachment");
  expect(entry.attachment).toBe("present");
  expect(filmEntryView(entry)).toBe("stale");
  expect(canTakeFilmAction(entry, "add")).toBe(false);
  // Replace is the repair, and it is offered right there.
  expect(canTakeFilmAction(entry, "replace")).toBe(true);
});

test("only a demonstrated absence reaches the empty state", () => {
  const cases: MatchFilmEntry[] = [
    { attachment: null, actions: [], problem: null },
    { attachment: null, actions: [], problem: "storage_unavailable" },
    { attachment: "present", actions: [], problem: null },
    { attachment: "present", actions: [], problem: "storage_unavailable" },
    { attachment: "present", actions: [], problem: "stale_attachment" },
    { attachment: "absent", actions: [], problem: "storage_unavailable" },
    { attachment: "absent", actions: [], problem: "stale_attachment" },
  ];
  for (const entry of cases) {
    expect(filmEntryView(entry), JSON.stringify(entry)).not.toBe("empty");
  }
  expect(
    filmEntryView({ attachment: "absent", actions: [], problem: null }),
  ).toBe("empty");
  // And the safe default offers nothing and claims nothing.
  expect(NO_FILM_ENTRY.actions).toEqual([]);
  expect(filmEntryView(NO_FILM_ENTRY)).toBe("unavailable");
});

/* -------------------------------------------------------------------------
 * 4. Where the actions go, and where a save returns
 * ---------------------------------------------------------------------- */

test("every action opens T21's attachment route, never a second parameter", () => {
  for (const mode of ["add", "replace", "align"] as const) {
    const href = matchVideoWizardHref(MATCH, mode);
    const url = new URL(href, "https://app.example");
    expect(url.pathname).toBe("/dashboard/matches/new");
    expect(url.searchParams.get("videoFor")).toBe(MATCH);
    expect(url.searchParams.get("mode")).toBe(mode);
    // No creation parameter rides along — `classifyNewMatchVisit` refuses a
    // URL carrying both readings rather than ranking them.
    expect(url.searchParams.get("match")).toBeNull();
    expect(url.searchParams.get("draft")).toBeNull();
  }
});

test("a successful save returns to the same match with Video selected", () => {
  const href = matchFilmHref(MATCH);
  const url = new URL(href, "https://app.example");
  expect(url.pathname).toBe(`/dashboard/matches/${MATCH}`);
  expect(parseReportView(url.searchParams.get("tab"))).toBe("film");

  // The route component navigates to `returnTarget.href` — the value the
  // server already built with `matchFilmHref` and the footer's Cancel already
  // uses — and constructs no URL of its own. A second spelling of the Video
  // view is how these two drift apart.
  const ROUTE = readFileSync(
    "src/components/dashboard/matches/match-video-attachment/AttachmentWizardRoute.tsx",
    "utf8",
  );
  const route = code(ROUTE);
  expect(route).toContain("props.returnTarget.href");
  expect(route).toContain("router.replace(href)");
  expect(route).toContain("router.refresh()");
  expect(route).not.toContain("?tab=");
  expect(route).not.toContain("/dashboard/matches");
  // Fired once: the flow is already inert once saved, and the latch makes a
  // double navigation impossible rather than merely unlikely.
  expect(route).toContain("returned.current");
});

/* -------------------------------------------------------------------------
 * 5. What the components may draw
 * ---------------------------------------------------------------------- */

/**
 * The file with its comments removed.
 *
 * Every claim below is about what the component DOES. These files explain
 * themselves at length — the empty state names `match.createdBy` to say it
 * deliberately does not read it, and the unavailable state names "Add video"
 * to say it never draws one — so asserting over the raw text would fail on the
 * sentences that agree with the assertion.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const FILM_TAB = readFileSync(
  "src/components/dashboard/matches/match-detail/film/film-tab.tsx",
  "utf8",
);
const EMPTY = readFileSync(
  "src/components/dashboard/matches/match-detail/film/film-empty-state.tsx",
  "utf8",
);
const ACTIONS = readFileSync(
  "src/components/dashboard/matches/match-detail/film/film-entry-actions.tsx",
  "utf8",
);
const UNAVAILABLE = readFileSync(
  "src/components/dashboard/matches/match-detail/film/film-unavailable-state.tsx",
  "utf8",
);

test("the Film view routes its no-video case through the shared rule", () => {
  // Not a hand-written `if (!video) return <FilmEmptyState/>` any more: that
  // line is what turned every storage failure into an Add button.
  expect(code(FILM_TAB)).toContain("filmEntryView(entry)");
  expect(code(FILM_TAB)).toMatch(/view === "empty"[\s\S]{0,80}FilmEmptyState/);
  expect(code(FILM_TAB)).toContain("FilmUnavailableState");
});

test("no component decides for itself who may act", () => {
  for (const [label, source] of [
    ["film-tab", FILM_TAB],
    ["film-empty-state", EMPTY],
    ["film-entry-actions", ACTIONS],
    ["film-unavailable-state", UNAVAILABLE],
  ] as const) {
    // The capability arrives as a prop. A component that read `createdBy`,
    // the workspace or the provider to decide would be answering a question
    // the server already answered — differently, on the day they disagree.
    expect(code(source), `${label} must not read createdBy`).not.toMatch(
      /createdBy/,
    );
    expect(code(source), `${label} must not read the workspace`).not.toMatch(
      /useWorkspace/,
    );
  }
  // Both action surfaces gate on the server's list and nothing else.
  expect(code(ACTIONS)).toContain('canTakeFilmAction(entry, "replace")');
  expect(code(ACTIONS)).toContain('canTakeFilmAction(entry, "align")');
  expect(code(EMPTY)).toContain('canTakeFilmAction(entry, "add")');
});

test("the actions row is absent, never disabled, for a viewer with none", () => {
  const actions = code(ACTIONS);
  expect(actions).toMatch(/if \(!mayReplace && !mayAlign\) return null;/);
  expect(actions).not.toContain("disabled");
  // And it can never draw an add: an active attachment is what put it here.
  expect(actions).not.toContain('"add"');
});

const REFUSAL_COPY = readFileSync(
  "src/components/dashboard/matches/match-detail/film/film-refusal-copy.ts",
  "utf8",
);

test("the unavailable state never offers to add a video", () => {
  const unavailable = code(UNAVAILABLE);
  const copy = code(REFUSAL_COPY);
  expect(unavailable).not.toContain("Add video");
  expect(unavailable).not.toContain("matchVideoWizardHref");
  expect(unavailable).not.toContain("addVideoHref");
  expect(unavailable).toContain('role="alert"');
  // Three sentences for the three amounts the page can know: the file is gone,
  // the store could not be asked, or the saved state itself is unknown. The
  // last must not claim a video exists — that would be a guess — and must not
  // claim none does, which is the guess that ends in a duplicate upload.
  expect(unavailable).toContain("FILM_REFUSAL_COPY");
  expect(copy).toContain("The recording was removed from this match.");
  expect(copy).toContain("the recording is still attached to this match");
  expect(copy).toContain("could not read whether this match has a video");
  expect(unavailable).toContain('entry.attachment === "present"');
});

test("an import's empty state offers the attachment wizard or nothing", () => {
  // The analysis wizard (`?match=`) is still the offer for every other match;
  // a SwingVision import's offer is the attachment flow's, and it is drawn
  // only when the server said so.
  expect(EMPTY).toContain('matchVideoWizardHref(match.id, "add")');
  expect(EMPTY).toContain("addVideoHref(");
  expect(EMPTY).toMatch(/offered && \(/);
});

/* -------------------------------------------------------------------------
 * 6. The match page, unchanged where it matters
 * ---------------------------------------------------------------------- */

const PAGE = readFileSync(
  "src/app/dashboard/matches/(detail)/[matchId]/page.tsx",
  "utf8",
);

test("the analysing short-circuit still returns before any Film entry", () => {
  // Guardrails §3.3. The gate, its condition and its early return are intact,
  // and the Video view — with its actions — is below it, so an in-flight match
  // still renders hero + progress and nothing else.
  const gate = PAGE.indexOf("if (isAwaitingAnalysis)");
  const progress = PAGE.indexOf("<MatchAnalysisProgress");
  const film = PAGE.indexOf("<FilmTab");
  expect(gate).toBeGreaterThan(-1);
  expect(progress).toBeGreaterThan(gate);
  expect(film).toBeGreaterThan(progress);
  expect(PAGE).toContain(
    "isInFlight(analysis.status) || isAnalysisFailed(analysis.status)",
  );
  // The short-circuit's own return carries no view switcher and no FilmTab.
  const shortCircuit = PAGE.slice(gate, PAGE.indexOf("<MarkReportSeen"));
  expect(shortCircuit).not.toContain("FilmTab");
  expect(shortCircuit).not.toContain("MatchReportViewSwitcher");
});

test("the capability is resolved on the server and handed down", () => {
  expect(PAGE).toContain("getMatchFilmEntry(matchId)");
  expect(PAGE).toContain("<FilmTab video={video} entry={filmEntry} />");
  // In the same wave as the rest of the page's reads, not in front of them.
  expect(PAGE).toMatch(
    /const \[data, jobs, video, filmEntry\] = await Promise\.all\(\[/,
  );
});
