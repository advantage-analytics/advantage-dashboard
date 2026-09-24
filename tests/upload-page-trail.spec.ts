import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { expect, test } from "@playwright/test";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

/**
 * `/dashboard/team/upload?entry=` is an upload aimed at one line of one event,
 * so its header trail sits under that event the way `/edit` and `/score` do:
 * "Schedule › vs Stanford › Upload video". Every other branch — the bare line
 * picker, `?match=` alone (a single match, no event), `?draft=` — publishes no
 * slot and keeps the static "Upload video" crumb from `nav.ts`.
 *
 * The real route runs with every import mocked (the
 * `event-route-loading.spec.ts` pattern) and the returned element tree is
 * searched for the mocked `EventHeaderSlot`. Nothing is rendered: the slot
 * publishes from an effect, so what can be pinned server-side is that the page
 * mounts it with the right props, and `event-header-trail.spec.ts` pins what
 * those props draw.
 */

function EventHeaderSlot() {
  return null;
}
function UploadMatchFlow() {
  return null;
}

const EVENT = { id: "event-1", name: "Stanford", kind: "dual" as const };
const SINGLES_ENTRY = {
  id: "entry-singles",
  discipline: "singles",
  matches: [{ id: "match-1" }],
};

function loadPage() {
  const output = ts.transpileModule(
    readFileSync(resolve("src/app/dashboard/team/upload/page.tsx"), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;

  const exports: {
    default?: (props: {
      searchParams: Promise<Record<string, string>>;
    }) => Promise<unknown>;
  } = {};
  const stubs: Record<string, unknown> = {
    "react/jsx-runtime": jsxRuntime,
    "next/link": { default: () => null },
    "lucide-react": { ChevronRight: () => null },
    "next/navigation": {
      redirect: (path: string) => {
        throw new Error(`redirect:${path}`);
      },
    },
    "@/lib/workspace/active-workspace-server": {
      getWorkspaceContext: async () => ({
        active: { id: "program-a", kind: "team", role: "coach" },
        available: [],
      }),
    },
    "@/lib/workspace/types": {
      canUploadForProgram: () => true,
      isProgramStaff: (workspace: { role: string }) =>
        workspace.role === "coach",
    },
    "@/lib/data/schedule-server": {
      getUploadQueue: async () => [{ event: EVENT, entries: [SINGLES_ENTRY] }],
      getProgramSchedule: async () => ({
        entriesByEvent: new Map([[EVENT.id, [SINGLES_ENTRY]]]),
      }),
      programNamesFor: async () => new Map(),
    },
    "@/lib/wizard/actions": {
      loadMatchDraft: async () => null,
    },
    "@/components/dashboard/matches/new-match-wizard/subject-eligibility": {
      draftBelongsToWorkspace: () => true,
      draftWorkspaceRefusal: () => "",
    },
    "@/lib/schedule/line-choices": {
      presetFor: () => ({ entryId: SINGLES_ENTRY.id }),
      lineupChoices: () => [],
      singleMatchPreset: () => ({ singleMatchId: "single-1" }),
    },
    "@/lib/data/single-match-server": {
      getTeamSingleMatch: async (_programId: string, id: string) => ({
        id,
        context: "Fall Open",
        round: null,
        playerName: "A",
        playerUserId: null,
        opponentName: "B",
        date: "2026-09-01",
        surface: "hard",
        score: null,
      }),
    },
    "@/lib/schedule/entry-state": { supportsVideo: () => true },
    "@/lib/schedule/format": {
      formatEventSpan: () => "",
      siteLabel: () => "",
    },
    "@/components/dashboard/matches/new-match-wizard": { UploadMatchFlow },
    "@/components/dashboard/schedule/event-header-slot": { EventHeaderSlot },
  };

  runInNewContext(output, {
    exports,
    require: (id: string) => {
      if (id in stubs) return stubs[id];
      throw new Error(`unexpected:${id}`);
    },
  });
  return exports.default!;
}

type Element = { type: unknown; props: Record<string, unknown> };

function isElement(node: unknown): node is Element {
  return typeof node === "object" && node !== null && "props" in node;
}

/** Every element in the returned tree whose type is `type`. */
function findAll(node: unknown, type: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, type));
  if (!isElement(node)) return [];
  return [
    ...(node.type === type ? [node] : []),
    ...findAll(node.props.children, type),
  ];
}

async function render(searchParams: Record<string, string>) {
  return loadPage()({ searchParams: Promise.resolve(searchParams) });
}

test("a staff upload aimed at a line publishes the event's trail", async () => {
  const tree = await render({ entry: SINGLES_ENTRY.id });

  const slots = findAll(tree, EventHeaderSlot);
  expect(slots).toHaveLength(1);
  expect(slots[0].props).toEqual({
    eventId: "event-1",
    name: "Stanford",
    kind: "dual",
    leaf: "Upload video",
  });

  // Beside the wizard, with its preset untouched.
  const flows = findAll(tree, UploadMatchFlow);
  expect(flows).toHaveLength(1);
  expect(flows[0].props).toEqual({
    preset: { entryId: SINGLES_ENTRY.id, lineup: [] },
  });
});

test("the bare staff line picker publishes no slot", async () => {
  const tree = await render({});
  expect(findAll(tree, EventHeaderSlot)).toHaveLength(0);
});

test("a ?match=-only single match publishes no slot", async () => {
  const tree = await render({ match: "single-1" });
  expect(findAll(tree, EventHeaderSlot)).toHaveLength(0);
  expect(findAll(tree, UploadMatchFlow)).toHaveLength(1);
});
