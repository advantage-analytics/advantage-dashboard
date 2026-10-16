import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  flipPlacement,
  setPlacementTarget,
  startPlacement,
  type PlacementState,
} from "@/components/admin/labels/court-placement";
import {
  createVideoClock,
  type VideoClock,
} from "@/components/admin/labels/video-clock";
import type { LabelPoint } from "@/lib/services/labels/session";
import { tag as tagOf } from "./fixtures/html-probe";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/** The console's court panel in each of its states, and the views' outline while placing. */

type PanelProps = {
  point: LabelPoint | null;
  names: { p1: string; p2: string };
  placement: PlacementState;
  editable: boolean;
  playingShotId?: string | null;
  clock: VideoClock;
  onPlace: () => void;
  onTarget: () => void;
  onFlip: () => void;
  fill?: boolean;
  review?: Review | null;
};

/** label-black-mark.tsx `CourtReview`, as the panel draws it. */
type Review = {
  id: number;
  tone: "score" | "data";
  question: string;
  evidence: string[];
  answers: {
    label: string;
    kind: "answer" | "dismiss" | "looks-right";
    run: () => void;
  }[];
};

type ViewProps = {
  initialRailWidth?: number;
  video: React.ReactNode;
  court: React.ReactNode;
  placing?: boolean;
  children?: React.ReactNode;
};

const P1 = labelSessionFixture().points.find(
  (point) => point.id === FIXTURE_POINT_IDS.P1,
)!;
const NAMES = { p1: "Lee", p2: "Vargas" };

function loadPanel() {
  return createLoader().load(
    "src/components/admin/labels/label-court-panel.tsx",
  ) as {
    LabelCourtPanel: React.ComponentType<PanelProps>;
    isPlacing: (
      point: LabelPoint | null,
      placement: PlacementState,
      editable: boolean,
    ) => boolean;
  };
}

function render(props: Partial<PanelProps>): string {
  return renderToStaticMarkup(
    React.createElement(loadPanel().LabelCourtPanel, {
      point: P1,
      names: NAMES,
      placement: startPlacement(null),
      editable: true,
      clock: createVideoClock(null),
      onPlace: () => {},
      onTarget: () => {},
      onFlip: () => {},
      ...props,
    }),
  );
}

const title = (html: string) =>
  /data-court-title="[^"]*"[^>]*>([^<]*)</.exec(html)?.[1];
const subtitle = (html: string) =>
  /data-court-subtitle="[^"]*"[^>]*>([^<]*)</.exec(html)?.[1];

test.describe("the court panel", () => {
  test("not placing: the whole court, read-only, the playing stroke named", () => {
    const html = render({ playingShotId: "s-return" });
    expect(html).toContain('data-court-view="whole"');
    expect(html).toContain('viewBox="-7.265 -4.5 14.53 32.77"');
    expect(html).not.toContain('<button type="button" data-court-target');
    expect(html).not.toContain("data-court-steps");
    expect(title(html)).toBe("Point 1");
    expect(subtitle(html)).toBe("Shot 2 of 3 · Vargas");
  });

  test("placing a contact: the hitter's half, the prompt and the switch", () => {
    const html = render({ placement: startPlacement("s-return", "far") });
    expect(html).toContain('data-court-view="far"');
    expect(html).toContain('viewBox="-10.085 -3.5 20.17 16.224"');
    expect(title(html)).toBe("Shot 2 · contact");
    expect(subtitle(html)).toBe("Vargas’s side");
    expect(html).toMatch(
      /data-court-prompt=""[^>]*>Click where shot 2 was hit</,
    );
    expect(html).toMatch(
      /aria-pressed="true" data-court-step="contact"[^>]*>Contact</,
    );
    expect(html).not.toContain("data-court-legend");
  });

  test("placing a let serve: the title ends with 'let'; other shots unchanged", () => {
    const withLet: LabelPoint = {
      ...P1,
      shots: P1.shots.map((s) =>
        s.id === "s-serve" ? { ...s, result: "let" as const } : s,
      ),
    };
    const html = render({
      point: withLet,
      placement: startPlacement("s-serve", "near"),
    });
    expect(title(html)).toBe("Shot 1 · contact · let");
    const other = render({
      point: withLet,
      placement: startPlacement("s-return", "far"),
    });
    expect(title(other)).toBe("Shot 2 · contact");
  });

  test("a let serve playing: the title ends with 'let'; another stroke playing, unchanged", () => {
    const withLet: LabelPoint = {
      ...P1,
      shots: P1.shots.map((s) =>
        s.id === "s-serve" ? { ...s, result: "let" as const } : s,
      ),
    };
    const html = render({ point: withLet, playingShotId: "s-serve" });
    expect(title(html)).toBe("Point 1 · let");
    expect(subtitle(html)).toBe("Shot 1 of 3 · Lee");
    const other = render({ point: withLet, playingShotId: "s-return" });
    expect(title(other)).toBe("Point 1");
  });

  test("a stray let on a rally stroke is not a let: no suffix", () => {
    const stray: LabelPoint = {
      ...P1,
      shots: P1.shots.map((s) =>
        s.id === "s-return" ? { ...s, result: "let" as const } : s,
      ),
    };
    expect(title(render({ point: stray, playingShotId: "s-return" }))).toBe(
      "Point 1",
    );
  });

  test("placing a landing: the other half; flipped, back on the hitter's for a net ball", () => {
    const landing = setPlacementTarget(
      startPlacement("s-return", "far"),
      "landing",
    );
    const html = render({ placement: landing });
    expect(html).toContain('data-court-view="near"');
    expect(title(html)).toBe("Shot 2 · landing");
    expect(subtitle(html)).toBe("Lee’s side");
    expect(html).toMatch(
      /aria-pressed="true" data-court-step="landing"[^>]*>Landing</,
    );
    expect(html).toMatch(/aria-pressed="false" data-court-flip=""/);
    expect(html).toContain('data-selected-ring="landing"');

    const flipped = render({ placement: flipPlacement(landing) });
    expect(flipped).toContain('data-court-view="far"');
    expect(subtitle(flipped)).toBe("Flipped to Vargas’s side · Net");
    expect(flipped).toMatch(/aria-pressed="true" data-court-flip=""/);
  });

  test("read-only, or a selection that is not in the open point: no zoom", () => {
    for (const html of [
      render({ placement: startPlacement("s-return", "far"), editable: false }),
      render({ placement: startPlacement("somewhere-else", "far") }),
      render({ placement: startPlacement("s-return", "far"), point: null }),
    ]) {
      expect(html).toContain('data-court-view="whole"');
      expect(html).not.toContain("data-court-steps");
    }
    const empty = render({ point: null });
    expect(title(empty)).toBe("Court");
    expect(subtitle(empty)).toBe("No point open");
  });
});

test.describe("the current review item", () => {
  const noop = () => {};
  const ASKED: Review = {
    id: 4,
    tone: "score",
    question: "Was the last ball out?",
    evidence: [
      "The last ball is in by its landing, but the vendor called it out.",
      "A second line the header does not draw.",
    ],
    answers: [
      { label: "Yes, make it out", kind: "answer", run: noop },
      { label: "It was in", kind: "answer", run: noop },
      { label: "Dismiss", kind: "dismiss", run: noop },
      { label: "Looks right", kind: "looks-right", run: noop },
    ],
  };
  /** The header's title: the item's number, then its words. */
  const titleOf = (html: string) => {
    const at = html.indexOf("data-court-title");
    const span = html.slice(at, html.indexOf("data-court-subtitle", at));
    return {
      number: /data-court-review-number=""[^>]*>([^<]*)</.exec(span)?.[1],
      numberTag: /<span[^>]*data-court-review-number=""[^>]*>/.exec(span)?.[0],
      words: /<\/span>([^<]*)<\/span>/.exec(span)?.[1],
    };
  };
  /** The answers row's buttons: [kind, words, opening tag]. */
  const answersOf = (html: string) =>
    [
      ...html.matchAll(
        /<button[^>]*data-court-review-answer="([^"]*)"[^>]*>([^<]*)</g,
      ),
    ].map((m) => ({ kind: m[1], label: m[2], tag: m[0] }));

  test("asks it in the header: number, question and its first evidence line; the answers in one row under it", () => {
    const html = render({ review: ASKED });
    const head = titleOf(html);
    expect(head.number).toBe("4");
    expect(head.numberTag).toContain("text-[var(--rail-amber)]");
    expect(head.words).toBe("Was the last ball out?");
    expect(subtitle(html)).toBe(
      "The last ball is in by its landing, but the vendor called it out.",
    );
    expect(html).not.toContain("A second line the header does not draw.");
    // One row, right under the header and above the court.
    expect(html.match(/data-court-review-answers=""/g)).toHaveLength(1);
    expect(html.indexOf("data-court-review-answers")).toBeGreaterThan(
      html.indexOf("data-court-subtitle"),
    );
    expect(html.indexOf("data-court-review-answers")).toBeLessThan(
      html.indexOf("data-court-box"),
    );
    const buttons = answersOf(html);
    expect(buttons.map((b) => [b.kind, b.label])).toEqual([
      ["answer", "Yes, make it out"],
      ["answer", "It was in"],
      ["dismiss", "Dismiss"],
      ["looks-right", "Looks right"],
    ]);
    // The rail's text action: its pressed state, the lead answer amber.
    for (const b of buttons) expect(b.tag).toContain("active:scale-[0.96]");
    expect(buttons[0].tag).toContain("text-[var(--rail-amber)]");
    expect(buttons[1].tag).not.toContain("rail-amber");
    expect(buttons[0].tag).toContain(
      'aria-label="Yes, make it out: Was the last ball out?"',
    );
    // The amber the rail defines is defined here too.
    expect(tagOf(html, "data-court-panel")).toContain("--rail-amber:");
  });

  test("a data item's number and lead answer are not amber", () => {
    const html = render({
      review: {
        ...ASKED,
        tone: "data",
        question: "Serves",
        answers: [ASKED.answers[0]],
      },
    });
    expect(titleOf(html).numberTag).toContain("text-white/55");
    expect(titleOf(html).numberTag).not.toContain("rail-amber");
    expect(answersOf(html)[0].tag).not.toContain("text-[var(--rail-amber)]");
  });

  test("while placing, the subtitle keeps the armed end and its side", () => {
    const html = render({
      review: ASKED,
      placement: setPlacementTarget(
        startPlacement("s-return", "far"),
        "landing",
      ),
    });
    expect(titleOf(html).words).toBe("Was the last ball out?");
    expect(subtitle(html)).toBe("Shot 2 · landing · Lee’s side");
    expect(html).toContain("data-court-steps");
  });

  test("no answers, no row; no item, the panel exactly as before", () => {
    const quiet = render({ review: { ...ASKED, answers: [] } });
    expect(quiet).toContain('data-court-review="4"');
    expect(quiet).not.toContain("data-court-review-answers");
    const none = render({ review: null });
    expect(none).toBe(render({}));
    expect(none).not.toContain("data-court-review");
    expect(title(none)).toBe("Point 1");
  });

  test("the console's item, read off a point (`courtReview`), draws as asked", () => {
    const { courtReview } = createLoader().load(
      "src/components/admin/labels/label-black-mark.tsx",
    ) as {
      courtReview: (
        point: LabelPoint,
        marks: unknown,
        points: readonly LabelPoint[],
        names: typeof NAMES,
        edit: Record<string, unknown> | undefined,
      ) => Review | null;
    };
    // The fixture's ace, stored as the receiver's winner: "Different
    // ending?", asked as item 4 with its "Make it an ace".
    const ace = labelSessionFixture().points.find(
      (p) => p.id === FIXTURE_POINT_IDS.P2,
    )!;
    const point: LabelPoint = {
      ...ace,
      checkedAt: null,
      ending: "winner",
      endedBy: "p2",
      shots: ace.shots.map((s) => ({ ...s, landingX: 0.6, landingY: 17.79 })),
    };
    const marks = { points: {}, shots: {}, suggestions: [], serveSides: {} };
    const asked = courtReview(point, marks, [point], NAMES, {
      onPatchPoint: noop,
      operations: { onDismissSuggestion: noop, onSetChecked: noop },
    });
    expect(asked?.id).toBe(4);
    const html = render({ point, review: asked });
    expect(titleOf(html).words).toBe(asked!.question);
    expect(answersOf(html).map((b) => b.label)).toEqual(
      asked!.answers.map((a) => a.label),
    );
    expect(answersOf(html).map((b) => b.label)).toEqual([
      "Make it an ace",
      "Dismiss",
      "Looks right",
    ]);
    // Read-only: the item, no answers.
    const readOnly = courtReview(point, marks, [point], NAMES, undefined);
    expect(readOnly?.answers).toEqual([]);
  });
});

test.describe("the blue outline while placing", () => {
  const far = startPlacement("s-return", "far");

  test("`isPlacing`: a live stroke of the open point, on a console that may write", () => {
    const { isPlacing } = loadPanel();
    expect(isPlacing(P1, far, true)).toBe(true);
    expect(isPlacing(P1, far, false)).toBe(false);
    expect(isPlacing(P1, startPlacement(null), true)).toBe(false);
    expect(isPlacing(P1, startPlacement("somewhere-else", "far"), true)).toBe(
      false,
    );
    expect(isPlacing(null, far, true)).toBe(false);
  });

  function view(file: string, name: string, placing: boolean): string {
    const View = (
      createLoader().load(file) as Record<
        string,
        React.ComponentType<ViewProps>
      >
    )[name];
    return renderToStaticMarkup(
      React.createElement(
        View,
        {
          initialRailWidth: 640,
          video: React.createElement("div", { "data-stub-video": "" }),
          court: React.createElement("div", { "data-stub-court": "" }),
          placing,
        },
        React.createElement("div", { "data-stub-rail": "" }),
      ),
    );
  }

  test("the full screen's court is marked while placing", () => {
    const file = "src/components/admin/labels/label-black-view.tsx";
    const on = tagOf(
      view(file, "LabelBlackView", true),
      "data-label-black-court",
    );
    expect(on).toContain('data-court-placing="true"');
    const off = tagOf(
      view(file, "LabelBlackView", false),
      "data-label-black-court",
    );
    expect(off).toContain('data-court-placing="false"');
  });
});
