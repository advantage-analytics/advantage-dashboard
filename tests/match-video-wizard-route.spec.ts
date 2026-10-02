import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { classifyNewMatchVisit } from "@/lib/matches/new-match-visit";
import {
  MATCHES_LIST_HREF,
  attachmentMatchSummary,
  matchFilmHref,
  resolveAttachmentWizardTarget,
  type AttachmentWizardDeps,
  type AttachmentSummaryRow,
} from "@/lib/data/match-video-attachment-server";
import { parseReportView } from "@/components/dashboard/matches/match-detail/report-view";
import type { SourcePoint, SourceShot } from "@/lib/match-video/alignment";
import { matchVideoError } from "@/lib/match-video/types";
import { transportError } from "@/lib/services/match-video/http";
import type { VisibleMatchRow } from "@/lib/services/match-video/access";
import type { PlaybackAttachmentRow } from "@/lib/services/match-video/playback";
import type { Workspace } from "@/lib/workspace/types";

/**
 * `/dashboard/matches/new?videoFor=&mode=` (T21), run against fakes.
 *
 * Two halves, and they answer different questions.
 *
 * The first is `classifyNewMatchVisit`, which is pure and is the ONLY thing
 * standing between an attachment link and the match-creation branches. It runs
 * before any read, so it is tested before any fake exists.
 *
 * The second drives `resolveAttachmentWizardTarget` with every seam stubbed:
 * no session, no Supabase, no Azure. The claims worth making are all about
 * REFUSAL — who is sent away, and to which of the two destinations — because
 * the wizard this route opens is one whose every button is already proven
 * elsewhere.
 *
 * The one structural assertion at the end is about the page file itself: that
 * the attachment branch is resolved above the branches that can insert a
 * match, and that the flow is returned as the page root. Neither can be seen
 * from a function's return value, and both are the property a regression here
 * would break.
 */

/* -------------------------------------------------------------------------
 * Fixtures
 * ---------------------------------------------------------------------- */

const CREATOR = randomUUID();
const OTHER_USER = randomUUID();
const PROGRAM = randomUUID();
const OTHER_PROGRAM = randomUUID();

const PERSONAL_MATCH = randomUUID();
const TEAM_MATCH = randomUUID();
const VENDOR_MATCH = randomUUID();
const OTHERS_MATCH = randomUUID();
const UNTIMED_MATCH = randomUUID();

const MATCHES: Record<string, VisibleMatchRow> = {
  [PERSONAL_MATCH]: {
    id: PERSONAL_MATCH,
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
  // A vendor-analysed match. Visible, created by the caller, and still not a
  // match a video may be attached to.
  [VENDOR_MATCH]: {
    id: VENDOR_MATCH,
    created_by: CREATOR,
    program_id: null,
    source_provider: "splitstep",
  },
  // Visible (a teammate's), but somebody else's to change.
  [OTHERS_MATCH]: {
    id: OTHERS_MATCH,
    created_by: OTHER_USER,
    program_id: PROGRAM,
    source_provider: "swing-vision",
  },
  [UNTIMED_MATCH]: {
    id: UNTIMED_MATCH,
    created_by: CREATOR,
    program_id: null,
    source_provider: "swing-vision",
  },
};

const TIMED_POINTS: readonly SourcePoint[] = Object.freeze([
  Object.freeze({ pointNumber: 1, videoTime: 10, duration: 4 }),
  Object.freeze({ pointNumber: 2, videoTime: 100, duration: 5 }),
]) as readonly SourcePoint[];

const TIMED_SHOTS: readonly SourceShot[] = Object.freeze([
  Object.freeze({ videoTime: 10.4 }),
]) as readonly SourceShot[];

/** The final point has no duration: no known end, so nothing to align to. */
const UNTIMED_POINTS: readonly SourcePoint[] = Object.freeze([
  Object.freeze({ pointNumber: 1, videoTime: 10, duration: 4 }),
  Object.freeze({ pointNumber: 2, videoTime: 100, duration: null }),
]) as readonly SourcePoint[];

const SUMMARY: AttachmentSummaryRow = {
  player1_name: "Ada Revelli",
  player2_name: "Nina Stepanov",
  date: "2026-04-12",
  tournament_name: "Spring Invitational",
  score: {
    player1: [6, 7, 0],
    player2: [4, 6, 0],
    player1_tiebreaks: [null, null, null],
    player2_tiebreaks: [null, 3, null],
  },
};

function personal(userId: string): Pick<Workspace, "id" | "kind"> {
  return { id: userId, kind: "personal" };
}

function team(programId: string): Pick<Workspace, "id" | "kind"> {
  return { id: programId, kind: "team" };
}

function activeRow(overrides: Partial<PlaybackAttachmentRow> = {}) {
  return {
    id: randomUUID(),
    version: 2,
    offset_seconds: 5,
    confirmed_video_time_seconds: 5,
    verified_duration_seconds: 120,
    verified_content_type: "video/mp4",
    filename: "match.mp4",
    final_blob_key: "final/match.mp4",
    ...overrides,
  } satisfies PlaybackAttachmentRow;
}

interface FakeOptions {
  userId?: string | null;
  workspace?: Pick<Workspace, "id" | "kind"> | null;
  active?: PlaybackAttachmentRow | null;
  /** Force the attachment read to fail. */
  attachmentReadFails?: boolean;
  /** Force the SAS mint to fail, as an unreachable store would. */
  mintFails?: boolean;
  points?: readonly SourcePoint[];
  shots?: readonly SourceShot[];
  summary?: AttachmentSummaryRow | null;
  sourceReadFails?: boolean;
  matchReadFails?: boolean;
}

/** Every call the resolver made, so "never constructed" is assertable. */
interface Calls {
  mintedFor: string[];
  loadedAttachmentFor: string[];
}

function fakeDeps(options: FakeOptions = {}): {
  deps: AttachmentWizardDeps;
  calls: Calls;
} {
  const calls: Calls = { mintedFor: [], loadedAttachmentFor: [] };
  const userId = options.userId === undefined ? CREATOR : options.userId;

  const deps: AttachmentWizardDeps = {
    async currentUserId() {
      return userId;
    },
    async loadVisibleMatch(matchId) {
      if (options.matchReadFails) {
        return { match: null, error: "connection reset" };
      }
      return { match: MATCHES[matchId] ?? null, error: null };
    },
    async activeWorkspace() {
      return options.workspace === undefined
        ? personal(CREATOR)
        : options.workspace;
    },
    async loadActiveAttachment(matchId) {
      calls.loadedAttachmentFor.push(matchId);
      if (options.attachmentReadFails) {
        return {
          ok: false,
          error: transportError("internal_error", "attachment_read_failed"),
        };
      }
      return { ok: true, value: options.active ?? null };
    },
    mintPlayback(row) {
      calls.mintedFor.push(row.id);
      if (options.mintFails) {
        return {
          ok: false,
          error: matchVideoError("storage_unavailable", "sas_unavailable"),
        };
      }
      return {
        ok: true,
        value: {
          playbackUrl: `https://blob.example/${row.final_blob_key}?sig=r`,
          expiresAt: new Date("2026-04-12T12:00:00.000Z"),
        },
      };
    },
    async loadSummary() {
      return options.summary === undefined ? SUMMARY : options.summary;
    },
    async loadSourceRows() {
      if (options.sourceReadFails) return null;
      return {
        points: options.points ?? TIMED_POINTS,
        shots: options.shots ?? TIMED_SHOTS,
      };
    },
  };

  return { deps, calls };
}

/* -------------------------------------------------------------------------
 * 1. The URL reading, before any read
 * ---------------------------------------------------------------------- */

test("a URL with no attachment parameters is a creation visit", () => {
  expect(classifyNewMatchVisit({})).toEqual({ kind: "create" });
  expect(classifyNewMatchVisit({ draft: "d1" })).toEqual({ kind: "create" });
  expect(classifyNewMatchVisit({ source: "swing-vision" })).toEqual({
    kind: "create",
  });
  expect(classifyNewMatchVisit({ player: "p1" })).toEqual({ kind: "create" });
  expect(classifyNewMatchVisit({ match: PERSONAL_MATCH })).toEqual({
    kind: "create",
  });
});

test("videoFor with a mode is an attachment visit", () => {
  expect(
    classifyNewMatchVisit({ videoFor: PERSONAL_MATCH, mode: "replace" }),
  ).toEqual({ kind: "attach", matchId: PERSONAL_MATCH, mode: "replace" });
});

test("a missing or unreadable mode still reaches the resolver, not a default", () => {
  // Refusing here would refuse before authorization, which is the wrong order:
  // the resolver sends a caller who can see the match back to its own Video
  // view, and only the resolver knows whether they can.
  expect(classifyNewMatchVisit({ videoFor: PERSONAL_MATCH })).toEqual({
    kind: "attach",
    matchId: PERSONAL_MATCH,
    mode: undefined,
  });
  expect(
    classifyNewMatchVisit({ videoFor: PERSONAL_MATCH, mode: "Add" }),
  ).toEqual({ kind: "attach", matchId: PERSONAL_MATCH, mode: "Add" });
});

test("a creation parameter beside videoFor is refused, never ranked", () => {
  for (const conflict of [
    { draft: randomUUID() },
    { source: "swing-vision" },
    { player: randomUUID() },
    { match: TEAM_MATCH },
  ]) {
    expect(
      classifyNewMatchVisit({
        videoFor: PERSONAL_MATCH,
        mode: "add",
        ...conflict,
      }),
    ).toEqual({ kind: "refuse" });
  }
});

test("a mode without a subject is refused rather than ignored", () => {
  expect(classifyNewMatchVisit({ mode: "add" })).toEqual({ kind: "refuse" });
  expect(
    classifyNewMatchVisit({ mode: "add", source: "swing-vision" }),
  ).toEqual({ kind: "refuse" });
  // An empty `videoFor` names nothing and must not fall through to creation.
  expect(classifyNewMatchVisit({ videoFor: "", mode: "add" })).toEqual({
    kind: "refuse",
  });
});

/* -------------------------------------------------------------------------
 * 2. Who gets the wizard
 * ---------------------------------------------------------------------- */

test("a personal creator in their own workspace gets the add wizard", async () => {
  const { deps } = fakeDeps();
  const target = await resolveAttachmentWizardTarget(
    PERSONAL_MATCH,
    "add",
    deps,
  );

  expect(target.kind).toBe("wizard");
  if (target.kind !== "wizard") return;
  expect(target.props.mode).toBe("add");
  expect(target.props.matchId).toBe(PERSONAL_MATCH);
  expect(target.props.activeAttachment).toBeNull();
  expect(target.props.points).toEqual(TIMED_POINTS);
  expect(target.props.shots).toEqual(TIMED_SHOTS);
  // An add mints nothing: there is no saved file to open.
  expect(target.props.savedPlaybackUrl).toBeNull();
});

test("a team creator in THAT program's workspace gets the wizard", async () => {
  const { deps } = fakeDeps({ workspace: team(PROGRAM) });
  const target = await resolveAttachmentWizardTarget(TEAM_MATCH, "add", deps);
  expect(target.kind).toBe("wizard");
});

test("replace and align carry the saved attachment", async () => {
  const active = activeRow();
  const { deps, calls } = fakeDeps({ active });

  const replace = await resolveAttachmentWizardTarget(
    PERSONAL_MATCH,
    "replace",
    deps,
  );
  expect(replace.kind).toBe("wizard");
  if (replace.kind !== "wizard") return;
  expect(replace.props.activeAttachment).toEqual({
    id: active.id,
    version: 2,
    offsetSeconds: 5,
    confirmedVideoTimeSeconds: 5,
    durationSeconds: 120,
    contentType: "video/mp4",
    filename: "match.mp4",
  });
  // Replace uploads a NEW file; opening the old one would be pointless work on
  // a credential nobody watches.
  expect(replace.props.savedPlaybackUrl).toBeNull();
  expect(calls.mintedFor).toEqual([]);

  const align = await resolveAttachmentWizardTarget(
    PERSONAL_MATCH,
    "align",
    deps,
  );
  expect(align.kind).toBe("wizard");
  if (align.kind !== "wizard") return;
  expect(align.props.savedPlaybackUrl).toContain(active.final_blob_key);
  expect(calls.mintedFor).toEqual([active.id]);
});

/* -------------------------------------------------------------------------
 * 3. Who is sent away, and where
 * ---------------------------------------------------------------------- */

test("a caller who cannot see the match learns nothing about it", async () => {
  const invisible = randomUUID();
  for (const [label, options] of [
    ["no session", { userId: null }],
    ["not visible", {}],
  ] as const) {
    const { deps } = fakeDeps(options);
    const target = await resolveAttachmentWizardTarget(invisible, "add", deps);
    expect(target, label).toEqual({
      kind: "redirect",
      href: MATCHES_LIST_HREF,
    });
  }
});

test("a malformed id is refused before any read", async () => {
  const { deps, calls } = fakeDeps();
  expect(
    await resolveAttachmentWizardTarget("not-a-uuid", "add", deps),
  ).toEqual({ kind: "redirect", href: MATCHES_LIST_HREF });
  expect(calls.loadedAttachmentFor).toEqual([]);
});

test("a failed match read does not name the match either", async () => {
  const { deps } = fakeDeps({ matchReadFails: true });
  expect(
    await resolveAttachmentWizardTarget(PERSONAL_MATCH, "add", deps),
  ).toEqual({ kind: "redirect", href: MATCHES_LIST_HREF });
});

test("a visible non-creator is sent to the match's Video view", async () => {
  // A teammate's match: RLS shows it (same program), and it is still not
  // theirs to change. They learn that it exists — they were already looking at
  // it — but the attachment read is never reached.
  const { deps, calls } = fakeDeps({ workspace: team(PROGRAM) });
  const target = await resolveAttachmentWizardTarget(OTHERS_MATCH, "add", deps);
  expect(target).toEqual({
    kind: "redirect",
    href: matchFilmHref(OTHERS_MATCH),
  });
  expect(calls.loadedAttachmentFor).toEqual([]);
});

test("the wrong active workspace is refused, both directions", async () => {
  // A team match while a personal workspace is active.
  const personalActive = fakeDeps({ workspace: personal(CREATOR) });
  expect(
    await resolveAttachmentWizardTarget(TEAM_MATCH, "add", personalActive.deps),
  ).toEqual({ kind: "redirect", href: matchFilmHref(TEAM_MATCH) });

  // A personal match while a team workspace is active.
  const teamActive = fakeDeps({ workspace: team(PROGRAM) });
  expect(
    await resolveAttachmentWizardTarget(PERSONAL_MATCH, "add", teamActive.deps),
  ).toEqual({ kind: "redirect", href: matchFilmHref(PERSONAL_MATCH) });

  // The right kind of workspace, the wrong program.
  const otherProgram = fakeDeps({ workspace: team(OTHER_PROGRAM) });
  expect(
    await resolveAttachmentWizardTarget(TEAM_MATCH, "add", otherProgram.deps),
  ).toEqual({ kind: "redirect", href: matchFilmHref(TEAM_MATCH) });
});

test("a vendor-analysed match is refused for its own creator", async () => {
  const { deps } = fakeDeps();
  expect(
    await resolveAttachmentWizardTarget(VENDOR_MATCH, "add", deps),
  ).toEqual({ kind: "redirect", href: matchFilmHref(VENDOR_MATCH) });
});

test("an unreadable mode is refused, never defaulted to add", async () => {
  const { deps, calls } = fakeDeps();
  for (const mode of [undefined, null, "", "Add", "adjust", "add ", 3, ["add"]])
    expect(
      await resolveAttachmentWizardTarget(PERSONAL_MATCH, mode, deps),
      String(mode),
    ).toEqual({ kind: "redirect", href: matchFilmHref(PERSONAL_MATCH) });
  expect(calls.loadedAttachmentFor).toEqual([]);
});

/* -------------------------------------------------------------------------
 * 4. The stale mode
 * ---------------------------------------------------------------------- */

test("add against a match that now HAS a video is refused", async () => {
  // The second tab: Add was opened when there was nothing, and an upload
  // finished elsewhere in the meantime.
  const { deps } = fakeDeps({ active: activeRow() });
  expect(
    await resolveAttachmentWizardTarget(PERSONAL_MATCH, "add", deps),
  ).toEqual({ kind: "redirect", href: matchFilmHref(PERSONAL_MATCH) });
});

test("replace and align against a match with no video are refused", async () => {
  const { deps } = fakeDeps({ active: null });
  for (const mode of ["replace", "align"] as const) {
    expect(
      await resolveAttachmentWizardTarget(PERSONAL_MATCH, mode, deps),
      mode,
    ).toEqual({ kind: "redirect", href: matchFilmHref(PERSONAL_MATCH) });
  }
});

test("an unreadable attachment state opens nothing", async () => {
  const { deps } = fakeDeps({ attachmentReadFails: true });
  expect(
    await resolveAttachmentWizardTarget(PERSONAL_MATCH, "add", deps),
  ).toEqual({ kind: "redirect", href: matchFilmHref(PERSONAL_MATCH) });
});

/* -------------------------------------------------------------------------
 * 5. Timing, and the one failure that does NOT redirect
 * ---------------------------------------------------------------------- */

test("an import with no usable final timing has no wizard to open", async () => {
  const { deps } = fakeDeps({ points: UNTIMED_POINTS, shots: [] });
  expect(
    await resolveAttachmentWizardTarget(UNTIMED_MATCH, "add", deps),
  ).toEqual({ kind: "redirect", href: matchFilmHref(UNTIMED_MATCH) });
});

test("an unreadable source timeline opens nothing", async () => {
  const { deps } = fakeDeps({ sourceReadFails: true });
  expect(
    await resolveAttachmentWizardTarget(PERSONAL_MATCH, "add", deps),
  ).toEqual({ kind: "redirect", href: matchFilmHref(PERSONAL_MATCH) });
});

test("a playback credential that cannot be minted opens the wizard anyway", async () => {
  // The one refusal that must NOT bounce: sending someone back to Film here
  // invites them to press Add over a row that is still active.
  const { deps } = fakeDeps({ active: activeRow(), mintFails: true });
  const target = await resolveAttachmentWizardTarget(
    PERSONAL_MATCH,
    "align",
    deps,
  );
  expect(target.kind).toBe("wizard");
  if (target.kind !== "wizard") return;
  expect(target.props.savedPlaybackUrl).toBeNull();
  expect(target.props.activeAttachment).not.toBeNull();
});

/* -------------------------------------------------------------------------
 * 6. The pinned subject and the return target
 * ---------------------------------------------------------------------- */

test("the score is pre-formatted with the shared formatter", async () => {
  const summary = attachmentMatchSummary(SUMMARY);
  // Hyphen between games, comma-space between sets, trailing unplayed set
  // trimmed — `lib/ui/score-format.ts`, not a second spelling.
  expect(summary.score).toBe("6-4, 7-6");
  expect(summary.playerName).toBe("Ada Revelli");
  expect(summary.opponentName).toBe("Nina Stepanov");
  expect(summary.date).toBe("2026-04-12");
  expect(summary.eventName).toBe("Spring Invitational");
});

test("an unscored match pins no score rather than a zero one", () => {
  const summary = attachmentMatchSummary({
    ...SUMMARY,
    score: null,
    tournament_name: null,
  });
  expect(summary.score).toBeNull();
  expect(summary.eventName).toBeNull();
});

test("the return target is the EXISTING Film selection contract", async () => {
  const { deps } = fakeDeps();
  const target = await resolveAttachmentWizardTarget(
    PERSONAL_MATCH,
    "add",
    deps,
  );
  expect(target.kind).toBe("wizard");
  if (target.kind !== "wizard") return;

  const href = target.props.returnTarget.href;
  expect(href).toBe(`/dashboard/matches/${PERSONAL_MATCH}?tab=film`);

  // Not a new parameter: this is the one the match report already reads.
  const query = new URLSearchParams(href.split("?")[1]);
  expect(parseReportView(query.get("tab"))).toBe("film");
  expect(href.startsWith(`/dashboard/matches/${PERSONAL_MATCH}?`)).toBe(true);
});

/* -------------------------------------------------------------------------
 * 7. The page file's own shape
 * ---------------------------------------------------------------------- */

const PAGE = readFileSync("src/app/dashboard/matches/new/page.tsx", "utf8");

test("the attachment branch is resolved above every creation branch", () => {
  // Inside the page function only — the import block names the same symbols
  // and would make any order look right.
  const start = PAGE.indexOf("export default async function NewMatchPage");
  expect(start).toBeGreaterThan(-1);
  const BODY = PAGE.slice(start);

  const attach = BODY.indexOf('visit.kind === "attach"');
  const refuse = BODY.indexOf('visit.kind === "refuse"');
  const addVideo = BODY.indexOf("getAddVideoTarget(");
  const draft = BODY.indexOf("loadMatchDraft(");
  const upload = BODY.indexOf("<UploadMatchFlow");

  for (const [label, index] of [
    ["?match=", addVideo],
    ["?draft=", draft],
    ["<UploadMatchFlow>", upload],
  ] as const) {
    expect(index, label).toBeGreaterThan(-1);
    expect(refuse, `refusal before ${label}`).toBeLessThan(index);
    expect(attach, `attachment before ${label}`).toBeLessThan(index);
  }
});

test("both wizards are returned as the page root, so the footer pins alike", () => {
  // `WizardShell`'s footer is `sticky bottom-0 mt-auto`: it pins against
  // whatever column the page is rendered into. Neither flow is wrapped in
  // anything this page adds, so the attachment wizard sits in the same
  // dashboard container the upload wizard has always pinned against.
  // T22 swapped the flow for `AttachmentWizardRoute`, which renders the flow
  // and adds `onSaved` — no element of its own, so the claim is unchanged.
  expect(PAGE).toContain("return <AttachmentWizardRoute {...target.props}");
  expect(PAGE).toMatch(/return <UploadMatchFlow\b/);
  expect(PAGE).not.toMatch(/<div[^>]*>\s*<AttachmentWizardRoute/);
});

test("the four existing entry points still have their branches", () => {
  for (const marker of [
    "getAddVideoTarget(",
    "loadMatchDraft(",
    "isProviderSupported(",
    "rosterSubjectFor(",
    "draftWorkspaceRefusal(",
  ]) {
    expect(PAGE, marker).toContain(marker);
  }
});
