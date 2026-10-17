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
  NO_OPENED_COUNT,
  openedCount,
  stepCount,
} from "@/components/admin/labels/label-court-panel";
import {
  createVideoClock,
  type VideoClock,
} from "@/components/admin/labels/video-clock";
import type { LabelMarks } from "@/lib/services/labels/marks";
import { drawsGhosts } from "@/lib/services/labels/marks-state";
import {
  reviewStep,
  type ReviewAnswer,
  type ReviewStep,
} from "@/lib/services/labels/review-step";
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
  step?: ReviewStep | null;
  onAnswer?: (answer: ReviewAnswer) => void;
  onEstimate?: (estimate: boolean) => void;
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

test.describe("layout A: the review step beside the court", () => {
  const noop = () => {};
  /** A step as review-step.ts builds one, on the fixture's return. */
  const STEP = {
    item: { id: 4, tone: "score", state: "open", members: [] },
    index: 1,
    total: 2,
    question: "How did the last ball end?",
    explanation:
      "Click where it bounced. A bounce on Vargas’s own side means it never cleared the net.",
    target: { shotId: "s-return", place: "landing", slot: null },
    answers: [
      { id: "in", label: "Winner by Vargas", kind: "plain", writes: [] },
      { id: "out", label: "Out by Vargas", kind: "suggested", writes: [] },
      {
        id: "short",
        label: "Didn’t clear by Vargas",
        kind: "plain",
        detail: "Bounced on Vargas’s side, 3.0 m short of the net",
        writes: [],
      },
      { id: "dismiss", label: "Dismiss", kind: "dismiss", writes: [] },
    ],
    then: "Then: split or remove the shots after",
    replay: null,
  } as unknown as ReviewStep;

  /** The answers' buttons: [kind, id, words, opening tag]. */
  const answersOf = (html: string) =>
    [
      ...html.matchAll(
        /<button[^>]*data-court-review-answer="([^"]*)" data-court-review-answer-id="([^"]*)"[^>]*>([^<]*)</g,
      ),
    ].map((m) => ({ kind: m[1], id: m[2], label: m[3], tag: m[0] }));
  const text = (html: string, attr: string) =>
    new RegExp(`${attr}="[^"]*"[^>]*>([^<]*)<`).exec(html)?.[1];

  test("two columns: the step on the left, the court on the right, the foot under it", () => {
    const html = render({
      step: STEP,
      onAnswer: noop,
      placement: setPlacementTarget(
        startPlacement("s-return", "far"),
        "landing",
      ),
    });
    expect(tagOf(html, "data-court-panel")).toContain(
      'data-court-layout="review"',
    );
    const column = html.indexOf("data-court-review-column");
    const box = html.indexOf("data-court-box");
    expect(column).toBeGreaterThan(-1);
    expect(box).toBeGreaterThan(html.indexOf("data-court-review-then"));
    expect(html.indexOf("data-court-steps")).toBeGreaterThan(box);
    expect(html.indexOf("data-court-keys")).toBeGreaterThan(box);
    // The left column, top to bottom.
    expect(title(html)).toBe("Point 1");
    expect(subtitle(html)).toBe("Shot 2 · Vargas · backhand");
    expect(text(html, "data-court-review-question")).toBe(
      "How did the last ball end?",
    );
    expect(text(html, "data-court-review-count")).toBe("1 of 2");
    expect(text(html, "data-court-review-explanation")).toBe(STEP.explanation);
    expect(text(html, "data-court-review-then")).toBe(
      "Then: split or remove the shots after",
    );
    // The court's own line names the armed end and its side.
    expect(text(html, "data-court-side")).toBe("Landing · Lee’s side");
    // A score item: the amber wash and an amber count.
    expect(tagOf(html, "data-court-review=")).toContain(
      "bg-[var(--rail-amber-wash-faint)]",
    );
    expect(tagOf(html, "data-court-review-count")).toContain(
      "text-[var(--rail-amber)]",
    );
    // The court stays vertical at the half's box size.
    expect(html).toContain('data-court-view="near"');
  });

  test("answers are text actions: amber when suggested, plain ink, Dismiss quiet; a detail under its answer", () => {
    const html = render({ step: STEP, onAnswer: noop });
    const buttons = answersOf(html);
    expect(buttons.map((b) => [b.kind, b.label])).toEqual([
      ["plain", "Winner by Vargas"],
      ["suggested", "Out by Vargas"],
      ["plain", "Didn’t clear by Vargas"],
      ["dismiss", "Dismiss"],
    ]);
    for (const b of buttons) {
      expect(b.tag).toContain("active:scale-[0.96]");
      expect(b.tag).toContain("text-[13px]");
    }
    expect(buttons[1].tag).toContain("text-[var(--rail-amber)]");
    expect(buttons[0].tag).toContain("text-white/70");
    expect(buttons[0].tag).not.toContain("rail-amber");
    expect(buttons[3].tag).toContain("text-white/50");
    expect(buttons[1].tag).toContain(
      'aria-label="Out by Vargas: How did the last ball end?"',
    );
    // The detail is a quiet line right under its own answer.
    const short = html.indexOf('data-court-review-answer-id="short"');
    const detail = html.indexOf("data-court-review-detail");
    expect(detail).toBeGreaterThan(short);
    expect(detail).toBeLessThan(
      html.indexOf('data-court-review-answer-id="dismiss"'),
    );
    expect(text(html, "data-court-review-detail")).toBe(
      "Bounced on Vargas’s side, 3.0 m short of the net",
    );
    // The amber the rail defines is defined here too.
    expect(tagOf(html, "data-court-panel")).toContain("--rail-amber:");
  });

  test("a data item is not amber; read-only draws the step with no answers", () => {
    const data = render({
      step: { ...STEP, item: { ...STEP.item, tone: "data" } },
      onAnswer: noop,
    });
    expect(tagOf(data, "data-court-review=")).toContain("bg-white/[0.05]");
    expect(tagOf(data, "data-court-review-count")).toContain("text-white/55");
    const readOnly = render({ step: STEP });
    expect(readOnly).toContain('data-court-review="4"');
    expect(readOnly).not.toContain("data-court-review-answers");
  });

  test("n of m counts from the point's opening total: answering moves 1 of 2 to 2 of 2", () => {
    const opened = openedCount(NO_OPENED_COUNT, "p", { total: 2 });
    expect(stepCount(opened, { total: 2 })).toEqual({ index: 1, total: 2 });
    // One answered: the same point, one item left — the count keeps.
    const after = openedCount(opened, "p", { total: 1 });
    expect(after).toBe(opened);
    expect(stepCount(after, { total: 1 })).toEqual({ index: 2, total: 2 });
    // Another point counts afresh; nothing open forgets the point.
    expect(openedCount(after, "q", { total: 1 })).toEqual({
      pointId: "q",
      total: 1,
    });
    expect(openedCount(after, "p", null)).toBe(NO_OPENED_COUNT);
    expect(openedCount(NO_OPENED_COUNT, null, null)).toBe(NO_OPENED_COUNT);
    // More open than it opened with (an answer opened another): grows.
    expect(openedCount(after, "p", { total: 3 })).toEqual({
      pointId: "p",
      total: 3,
    });
  });

  test("no step: the panel exactly as before, placing or not", () => {
    expect(render({ step: null })).toBe(render({}));
    expect(render({ step: null })).not.toContain("data-court-review");
    const landing = setPlacementTarget(
      startPlacement("s-return", "far"),
      "landing",
    );
    expect(render({ step: null, placement: landing })).toBe(
      render({ placement: landing }),
    );
    expect(title(render({}))).toBe("Point 1");
  });

  test("the step read off a point (`reviewStep`) draws as built", () => {
    // The fixture's ace, stored as the receiver's winner: item 4.
    const ace = labelSessionFixture().points.find(
      (p) => p.id === FIXTURE_POINT_IDS.P2,
    )!;
    const point: LabelPoint = {
      ...ace,
      checkedAt: null,
      ending: "winner",
      endedBy: "p2",
      shots: ace.shots.map((s) => ({
        ...s,
        contactX: -1,
        contactY: -0.4,
        landingX: 0.6,
        landingY: 17.79,
      })),
    };
    const marks: LabelMarks = {
      points: {},
      shots: {},
      suggestions: [],
      serveSides: {},
    } as unknown as LabelMarks;
    const step = reviewStep(point, marks, [point], NAMES, drawsGhosts(marks))!;
    expect(step.item.id).toBe(4);
    const html = render({ point, step, onAnswer: noop });
    expect(text(html, "data-court-review-question")).toBe(step.question);
    expect(answersOf(html).map((b) => b.label)).toEqual(
      step.answers.map((a) => a.label),
    );
    expect(text(html, "data-court-review-count")).toBe(`1 of ${step.total}`);
  });
});

test.describe("the slid court and the estimate", () => {
  /** The return, its contact on Vargas's (far) side. */
  const returnWith = (patch: Partial<LabelPoint["shots"][number]>) => ({
    ...P1,
    shots: P1.shots.map((s) => (s.id === "s-return" ? { ...s, ...patch } : s)),
  });

  test("a landing on the hitter's own side: the box slides across the net, that side washed amber", () => {
    // Vargas hits from the far baseline; it bounces 3 m short of the net on
    // his own side.
    const point = returnWith({ landingX: 0.5, landingY: 14.885 });
    const landing = setPlacementTarget(
      startPlacement("s-return", "far"),
      "landing",
      24.49,
    );
    const html = render({ point, placement: landing });
    expect(html).toContain('data-court-slide="shank"');
    // The near half's box size, slid across the net: Vargas's side from the
    // net to 6.34 m back above it, Lee's service boxes below (court y 2 to
    // 18.224; SVG y 5.546 down).
    expect(html).toContain('viewBox="-10.085 5.546 20.17 16.224"');
    expect(html).toContain("data-court-wash");
    expect(tagOf(html, "data-court-wash")).toContain(
      "var(--rail-amber-wash-faint)",
    );
    expect(subtitle(html)).toBe("Didn’t clear the net · error by Vargas");
    // The NET label is still on screen.
    expect(html).toMatch(/>Net</);

    // Asked as a step: the readout in the box, the court's line plain.
    const step = render({
      point,
      placement: landing,
      step: {
        item: { id: 4, tone: "score", state: "open", members: [] },
        index: 1,
        total: 1,
        question: "How did the last ball end?",
        explanation: "x",
        target: { shotId: "s-return", place: "landing", slot: null },
        answers: [],
        then: null,
        replay: null,
      } as unknown as ReviewStep,
    });
    expect(step).toMatch(
      /data-court-shank=""[^>]*>Didn’t clear the net · error by Vargas</,
    );
    expect(step).toMatch(/data-court-side=""[^>]*>Landing · across the net</);

    // Flipped by hand, it is the hitter's whole half as before.
    const flipped = render({ point, placement: flipPlacement(landing) });
    expect(flipped).not.toContain("data-court-slide");
  });

  test("a contact deep behind the baseline: the box slides back, with 2 m guides and the usual edge", () => {
    // 4.2 m behind the far baseline: past the usual 3.5 m run-off.
    const point = returnWith({ contactX: 2.4, contactY: 27.97 });
    const html = render({
      point,
      placement: startPlacement("s-return", "far"),
    });
    expect(html).toContain('data-court-slide="deep"');
    // Run-off to 5.5 m: the far box's top edge is 29.27 m, SVG y −5.5.
    expect(html).toContain('viewBox="-10.085 -5.5 20.17 16.224"');
    expect(
      [...html.matchAll(/data-court-guide="(\d+)"/g)].map((m) => m[1]),
    ).toEqual(["2", "4"]);
    expect(html).toContain("data-court-usual-edge-line");
    expect(html).toMatch(/data-court-usual-edge=""[^>]*>usual edge</);
    expect(subtitle(html)).toBe("Vargas’s side · run-off to 5.5 m");
    // Inside the usual run-off: no slide, the half's own box.
    const usual = render({
      point: returnWith({ contactX: 1.8, contactY: 24.49 }),
      placement: startPlacement("s-return", "far"),
    });
    expect(usual).not.toContain("data-court-slide");
    expect(usual).toContain('viewBox="-10.085 -3.5 20.17 16.224"');
  });

  test("“Off screen, so this is an estimate” while placing; an estimate draws as a dashed amber ring", () => {
    const placing = startPlacement("s-return", "far");
    expect(render({ placement: placing })).not.toContain(
      "data-court-estimate-box",
    );
    const off = render({ placement: placing, onEstimate: () => {} });
    expect(off).toMatch(
      /data-court-estimate-box=""[\s\S]*?type="checkbox"[\s\S]*?Off screen, so this is an estimate</,
    );
    expect(tagOf(off, 'type="checkbox"')).not.toContain("checked");
    const point = returnWith({ unclear: ["contact_x", "contact_y"] });
    const on = render({ point, placement: placing, onEstimate: () => {} });
    expect(tagOf(on, 'type="checkbox"')).toContain('checked=""');
    expect(tagOf(on, "data-court-estimate=")).toContain("stroke-dasharray");
    expect(tagOf(on, "data-court-estimate=")).toContain("var(--rail-amber)");
    // Not placing: no box.
    expect(render({ onEstimate: () => {} })).not.toContain(
      "data-court-estimate-box",
    );
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

test("the step's shot line numbers strokes as the rail does: a ghost takes no number", () => {
  const { stepShotLine } = createLoader().load(
    "src/components/admin/labels/label-court-panel.tsx",
  ) as {
    stepShotLine: (
      point: LabelPoint,
      shotId: string | null,
      names: { p1: string; p2: string },
      ghosts?: boolean,
    ) => string | null;
  };
  const p4 = labelSessionFixture().points.find(
    (point) => point.id === FIXTURE_POINT_IDS.P4,
  )!;
  // Fault, ghost (removed by the site), second serve: the serve is shot 2
  // while ghosts are drawn, shot 3 when the session draws none.
  expect(stepShotLine(p4, "s-p4-serve", NAMES, true)).toMatch(/^Shot 2\b/);
  expect(stepShotLine(p4, "s-p4-serve", NAMES, false)).toMatch(/^Shot 3\b/);
});
