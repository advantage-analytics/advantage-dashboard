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

test.describe("the Round of a tournament line picked without one", () => {
  type RoundFieldProps = {
    value: string;
    takenRounds: readonly string[];
    onChange: (next: string) => void;
    disabled?: boolean;
    error?: string;
  };
  // The real MenuSelect draws its options only while open, so a stub lays
  // every option out as text for the markup to be read.
  const listing = createLoader({
    stubs: {
      "@/components/ui/menu-select": {
        MenuSelect: (props: {
          label: string;
          value: string | undefined;
          placeholder?: string;
          variant?: string;
          options: readonly { value: string; label: string }[];
        }) =>
          React.createElement(
            "div",
            {
              "data-menu": props.label,
              "data-variant": props.variant,
              "data-value": props.value ?? "",
            },
            React.createElement("span", null, props.placeholder),
            ...props.options.map((option) =>
              React.createElement("span", { key: option.value }, option.label),
            ),
          ),
      },
    },
  });
  const { EventRoundField } = listing.load(
    "src/components/dashboard/matches/match-actions/edit-match-event.tsx",
  ) as { EventRoundField: React.ComponentType<RoundFieldProps> };
  const render = (props: Partial<RoundFieldProps> = {}) =>
    renderToStaticMarkup(
      React.createElement(EventRoundField, {
        value: "",
        takenRounds: ["QF"],
        onChange: noop,
        ...props,
      }),
    );

  test("an underline Round menu without the rounds the entry already has", () => {
    const html = render();
    expect(html).toContain(">Round</span>");
    expect(html).toContain('data-menu="Round"');
    expect(html).toContain('data-variant="underline"');
    expect(html).toContain("Not set");
    expect(html).not.toContain("Quarterfinal");
    expect(html).toContain("Semifinal");
    expect(html).toContain("Round of 16");
    expect(html).not.toContain("var(--danger)");
  });

  test("the error sits under it in the danger ink", () => {
    const html = render({ error: "Choose the round." });
    expect(html).toMatch(
      /<span[^>]*style="color:var\(--danger\)"[^>]*>Choose the round\.<\/span>/,
    );
  });

  test("the real menu shows Not set until a round is chosen", () => {
    const { EventRoundField: Real } = loader.load(
      "src/components/dashboard/matches/match-actions/edit-match-event.tsx",
    ) as { EventRoundField: React.ComponentType<RoundFieldProps> };
    const empty = renderToStaticMarkup(
      React.createElement(Real, { value: "", takenRounds: [], onChange: noop }),
    );
    expect(empty).toContain('aria-label="Round"');
    expect(empty).toContain("Not set");
    const chosen = renderToStaticMarkup(
      React.createElement(Real, {
        value: "SF",
        takenRounds: ["QF"],
        onChange: noop,
      }),
    );
    expect(chosen).toContain("Semifinal");
    expect(chosen).not.toContain("Quarterfinal");
  });
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

  test("a pending tournament line takes its round in the event section", () => {
    expect(dialog).toContain('pendingLine?.eventKind === "tournament" && (');
    expect(dialog).toContain("takenRounds={pendingLine.takenRounds}");
    expect(dialog).toContain("error={fieldErrors.round}");
    // No round: nothing is sent, and the field says so.
    expect(dialog).toMatch(
      /if \(tournamentLine && !round\) \{\s*setFieldErrors\(\{ round: "Choose the round\." \}\);\s*return;\s*\}/,
    );
    const guard = dialog.indexOf("if (tournamentLine && !round)");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(dialog.indexOf("await fetch(`/api/matches/"));
    // The header and the closing sentence read the dialog's round.
    expect(dialog).toContain("round: pendingLineRound,");
    expect(dialog).toContain('(pendingLineRound ?? "the round you choose")');
  });
});
