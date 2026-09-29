import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The Edit Match dialog's "Remove from event" (`edit-match-event.tsx`).
 * Offline: the event rows render to static markup, and the wiring the dialog
 * and the GET route own is read from source.
 *
 *   - a linked match shows "Remove from event" only with `canDetach`, as blue
 *     text with no icon, beside the "Change them in Schedule" copy
 *   - after the detach the reloaded match draws an empty, editable Event field
 *   - the dialog confirms, calls `detach_match_from_event_line` and toasts
 */

const loader = createLoader();
const { LinkedEventLine, EventField, eventFieldValue, EVENT_ACTION_CLS } =
  loader.load(
    "src/components/dashboard/matches/match-actions/edit-match-event.tsx",
  ) as {
    LinkedEventLine: React.ComponentType<{
      eventKind: "dual" | "tournament";
      canDetach: boolean;
      onRemove: () => void;
      disabled?: boolean;
    }>;
    EventField: React.ComponentType<{
      value: string;
      onChange: (next: string) => void;
      disabled?: boolean;
      picker?: React.ReactNode;
      teamMatch: boolean;
      canAttach: boolean;
      onAdd: () => void;
    }>;
    eventFieldValue: (match: { tournament_name: string | null }) => string;
    EVENT_ACTION_CLS: string;
  };

const noop = () => {};
const linked = (canDetach: boolean) =>
  renderToStaticMarkup(
    React.createElement(LinkedEventLine, {
      eventKind: "dual",
      canDetach,
      onRemove: noop,
    }),
  );

test.describe("a match on a line", () => {
  test("with canDetach: the copy and a blue, iconless Remove from event", () => {
    const html = linked(true);
    expect(html).toContain("Change them in Schedule.");
    const button = /<button[^>]*>Remove from event<\/button>/.exec(html);
    expect(button, html).not.toBeNull();
    expect(button![0]).toContain(`class="${EVENT_ACTION_CLS}"`);
    expect(EVENT_ACTION_CLS).toContain("text-[var(--blue)]");
    expect(EVENT_ACTION_CLS).toContain("hover:text-[var(--blue-hover)]");
    expect(html).not.toContain("<svg");
  });

  test("without canDetach: the Change them in Schedule copy only", () => {
    const html = linked(false);
    expect(html).toContain(
      "The date, line and surface come from the dual. Change them in Schedule.",
    );
    expect(html).not.toContain("Remove from event");
    expect(html).not.toContain("<button");
  });
});

test("after the detach, the reloaded match draws an empty, editable Event field", () => {
  // The GET payload once `detach_match_from_event_line` has run: the line and
  // the event name are cleared, and the match can be attached again.
  const reloaded = {
    match: {
      tournament_name: null,
      event_entry_id: null,
      program_id: "p1",
    },
    event: null,
    canAttach: true,
    canDetach: false,
  };
  const html = renderToStaticMarkup(
    React.createElement(EventField, {
      value: eventFieldValue(reloaded.match),
      onChange: noop,
      teamMatch: !!reloaded.match.program_id,
      canAttach: reloaded.canAttach,
      onAdd: noop,
    }),
  );
  const input = /<input[^>]*aria-label="Event"[^>]*>/.exec(html);
  expect(input, html).not.toBeNull();
  expect(input![0]).toContain('value=""');
  expect(input![0]).not.toContain("disabled");
  expect(html).toContain("Add to an event");
  expect(html).not.toContain("Remove from event");
});

test.describe("wiring", () => {
  const read = (path: string) => readFileSync(resolve(path), "utf8");
  const dialog = read(
    "src/components/dashboard/matches/match-actions/edit-match-dialog.tsx",
  );
  const route = read("src/app/api/matches/[matchId]/route.ts");
  const action = read("src/lib/schedule/attach-line.ts");

  test("the GET route returns canDetach beside canAttach", () => {
    expect(route).toContain("canAttach, canDetach });");
    expect(route).toMatch(
      /const detachable = !!match\.program_id && !!match\.event_entry_id;/,
    );
    expect(route).toMatch(/const canDetach = detachable && runsSchedule;/);
  });

  test("the confirm is danger-toned, names the event, and shows the RPC's error", () => {
    expect(action).toContain('supabase.rpc("detach_match_from_event_line"');
    expect(action).toContain("return { ok: false, error: error.message };");
    expect(dialog).toContain("canDetach={!!loaded?.canDetach}");
    expect(dialog).toMatch(/<ConfirmDialog[\s\S]*tone="danger"/);
    expect(dialog).toContain("<Em>{event.eventName}</Em>");
    expect(dialog).toContain("error={detachError}");
    expect(dialog).toContain("setDetachError(detached.error);");
    expect(dialog).toContain("title: `Removed from ${detached.eventName}`");
    expect(dialog).toContain("[matchId, open, reloadKey]");
  });
});
