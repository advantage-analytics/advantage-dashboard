import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * `SupportThreadDialog` (T7): "Message Advantage". Offline — Radix portals
 * draw nothing in a static render, so `RosterDialog` is swapped for a stub
 * that prints its title, description, body and footer, and `MenuSelect` for
 * one that prints every option it is handed (its real menu only renders
 * while open). Everything else — the fold, the author lines, the option
 * builder — is the real code.
 */

const DIALOG = "src/components/dashboard/support/support-thread-dialog.tsx";

function RosterDialogStub(props: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return React.createElement(
    "div",
    { "data-dialog": "", "data-open": String(props.open) },
    React.createElement("h2", null, props.title),
    React.createElement("p", { "data-description": "" }, props.description),
    props.children,
    React.createElement("footer", null, props.footer),
  );
}

function MenuSelectStub(props: {
  label: string;
  placeholder?: string;
  options: {
    value: string;
    label: string;
    description?: string;
    group?: string;
  }[];
}) {
  return React.createElement(
    "div",
    { "data-menu": props.label, "data-placeholder": props.placeholder },
    props.options.map((option) =>
      React.createElement(
        "div",
        {
          key: option.value,
          "data-option": option.value,
          "data-group": option.group ?? "",
        },
        React.createElement("span", { "data-label": "" }, option.label),
        option.description
          ? React.createElement("span", { "data-sub": "" }, option.description)
          : null,
      ),
    ),
  );
}

const loader = createLoader({
  stubs: {
    "@/components/dashboard/team/dialog-shell": {
      RosterDialog: RosterDialogStub,
    },
    "@/components/ui/menu-select": { MenuSelect: MenuSelectStub },
  },
});

type Mod = {
  SupportThreadDialog: React.ComponentType<Record<string, unknown>>;
  supportAboutOptions: (
    matches: unknown[],
    isTeam: boolean,
  ) => { value: string; label: string; group?: string }[];
  supportSelection: (value: string | undefined) => {
    topic: string | null;
    matchId: string | null;
  };
};
const mod = loader.load(DIALOG) as unknown as Mod;

const MATCHES = [
  {
    id: "m-1",
    label: "vs. Rafael Nadal",
    dayLabel: "Oct 10",
    scoreText: "6-7, 0-2",
  },
  { id: "m-2", label: "vs. Roger Federer", dayLabel: "Oct 3", scoreText: "" },
];

const OTHER_LABELS = [
  "Uploading a video",
  "Plan and billing",
  "My team",
  "An idea or request",
  "Something else",
];

function render(props: Record<string, unknown>) {
  return renderToStaticMarkup(
    React.createElement(mod.SupportThreadDialog, {
      open: true,
      onOpenChange: () => {},
      onSend: async () => ({ ok: true }),
      isTeamWorkspace: false,
      now: new Date("2026-11-03T18:00:00Z"),
      timeZone: "UTC",
      ...props,
    }),
  );
}

function optionsIn(html: string, group: string): string[] {
  const re = new RegExp(
    `data-group="${group}"><span data-label="">([^<]+)</span>`,
    "g",
  );
  return [...html.matchAll(re)].map((m) => m[1].replace(/&#x27;/g, "'"));
}

test.describe("SupportThreadDialog compose form", () => {
  test("a team workspace offers all five 'Something else' topics after the matches", () => {
    const html = render({
      isTeamWorkspace: true,
      state: { status: "ready", thread: null, messages: [], matches: MATCHES },
    });
    expect(html).toContain("<h2>Message Advantage</h2>");
    expect(html).toContain(
      "Goes straight to the people building Advantage. We answer here, and you&#x27;ll see it in Activity.",
    );
    expect(html).toContain('data-placeholder="Choose one"');
    expect(optionsIn(html, "Something else")).toEqual(OTHER_LABELS);
    expect(optionsIn(html, "Your matches")).toEqual([
      "vs. Rafael Nadal",
      "vs. Roger Federer",
    ]);
    // The match's day and score ride as its second line.
    expect(html).toContain('<span data-sub="">Oct 10 · 6-7, 0-2</span>');
    expect(html).toContain("A stuck upload, or a question about format");
    expect(html).toContain("Pro, credit packs, receipts");
    expect(html).toContain("Something you&#x27;d like Advantage to do");
    expect(html).toContain(
      'placeholder="What happened, or what would make Advantage better"',
    );
    expect(html).toContain("About");
    expect(html).toContain("· optional");
    expect(html).toContain(">Cancel<");
    expect(html).toContain(">Send<");
  });

  test("a personal workspace omits 'My team'", () => {
    const html = render({
      isTeamWorkspace: false,
      state: { status: "ready", thread: null, messages: [], matches: MATCHES },
    });
    expect(optionsIn(html, "Something else")).toEqual(
      OTHER_LABELS.filter((label) => label !== "My team"),
    );
    expect(html).not.toContain("My team");
  });

  test("the selection maps to the action's topic and match id", () => {
    expect(mod.supportSelection(undefined)).toEqual({
      topic: null,
      matchId: null,
    });
    expect(mod.supportSelection("match:m-1")).toEqual({
      topic: "match",
      matchId: "m-1",
    });
    for (const topic of ["upload", "billing", "team", "idea", "other"]) {
      expect(mod.supportSelection(topic)).toEqual({ topic, matchId: null });
    }
    expect(mod.supportSelection("bogus")).toEqual({
      topic: null,
      matchId: null,
    });
  });
});

test.describe("SupportThreadDialog thread view", () => {
  const thread = {
    id: "t-1",
    origin: "account_menu",
    lastPlayerMessageAt: "2026-11-03T10:05:00Z",
    lastStaffMessageAt: "2026-11-03T09:12:00Z",
    playerReadAt: null,
    createdAt: "2026-10-28T12:00:00Z",
  };
  const message = (
    id: string,
    authorRole: string,
    body: string,
    createdAt: string,
    authorName: string | null = null,
  ) => ({
    id,
    authorRole,
    authorName,
    body,
    topic: null,
    matchId: null,
    createdAt,
  });
  const messages = [
    message("a", "player", "An older question.", "2026-10-28T12:00:00Z"),
    message(
      "b",
      "staff",
      "Done. The score now runs right from 4-3 in the first set.",
      "2026-11-03T09:12:00Z",
      "Cj",
    ),
    message("c", "player", "Looks right now, thanks.", "2026-11-03T10:05:00Z"),
  ];

  test("renders the seeded messages with their authors and a reply box", () => {
    const html = render({
      state: { status: "ready", thread, messages, matches: MATCHES },
    });
    expect(html).toContain(
      "Done. The score now runs right from 4-3 in the first set.",
    );
    expect(html).toContain("Looks right now, thanks.");
    expect(html).toContain("Cj at Advantage");
    expect(html).toContain(">You<");
    expect(html).toContain("Tuesday, Nov 3");
    expect(html).toContain('placeholder="Write a reply"');
    // No About picker once a thread exists.
    expect(html).not.toContain("data-menu");
  });

  test("days before yesterday fold behind 'Show N earlier'", () => {
    const html = render({
      state: { status: "ready", thread, messages, matches: [] },
    });
    expect(html).toContain("Show 1 earlier · From Wednesday, Oct 28");
    expect(html).not.toContain("An older question.");
  });
});
