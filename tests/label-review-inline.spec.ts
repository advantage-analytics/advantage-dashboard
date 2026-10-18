import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  NO_PLACEMENT,
  setPlacementTarget,
  startPlacement,
  type PlacementState,
} from "@/components/admin/labels/court-placement";
import { pointInfoLine } from "@/components/admin/labels/label-point-info";
import {
  NO_OPENED_COUNT,
  inlineReviewAnchor,
  openedCount,
  stepCount,
} from "@/components/admin/labels/label-review-inline";
import type { LabelMarks } from "@/lib/services/labels/marks";
import { drawsGhosts } from "@/lib/services/labels/marks-state";
import {
  reviewStep,
  type ReviewAnswer,
  type ReviewStep,
} from "@/lib/services/labels/review-step";
import type { LabelPoint } from "@/lib/services/labels/session";
import { count, tag as tagOf } from "./fixtures/html-probe";
import {
  FIXTURE_POINT_IDS,
  editContext,
  labelSessionFixture,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The review step asked inline in the rail: the block under the stroke it
 * is about, with the question and answers on the left and one compact court
 * on the right (`ReviewInlineBlock`), where it sits (`inlineReviewAnchor`),
 * and the court panel's information line (`pointInfoLine`).
 */

const NAMES = { p1: "Lee", p2: "Vargas" };
const P1 = labelSessionFixture().points.find(
  (point) => point.id === FIXTURE_POINT_IDS.P1,
)!;
/** Marks built with nothing counted: the step comes from the rows alone. */
const EMPTY_MARKS = {
  points: {},
  shots: {},
  suggestions: [],
  serveSides: {},
} as unknown as LabelMarks;

/** The fixture's ace, stored as the receiver's winner, so item 4 asks about it. */
function acePoint(shot: Partial<LabelPoint["shots"][number]> = {}): LabelPoint {
  const ace = labelSessionFixture().points.find(
    (p) => p.id === FIXTURE_POINT_IDS.P2,
  )!;
  return {
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
      ...shot,
    })),
  };
}

const stepOf = (point: LabelPoint) =>
  reviewStep(point, EMPTY_MARKS, [point], NAMES, drawsGhosts(EMPTY_MARKS))!;

type BlockProps = {
  point: LabelPoint;
  names: typeof NAMES;
  step: ReviewStep | null;
  anchor: { shotId: string | null; strokeId: string | null };
  placement: PlacementState;
  editable: boolean;
  ghosts?: boolean;
  count?: { index: number; total: number } | null;
  onAnswer?: (answer: ReviewAnswer) => void;
  onEstimate?: (estimate: boolean) => void;
  onPlace: () => void;
  onTarget: () => void;
  onFlip: () => void;
};

function renderBlock(props: Partial<BlockProps> & { point: LabelPoint }) {
  const { ReviewInlineBlock } = createLoader().load(
    "src/components/admin/labels/label-review-inline.tsx",
  ) as { ReviewInlineBlock: React.ComponentType<BlockProps> };
  return renderToStaticMarkup(
    React.createElement(ReviewInlineBlock, {
      names: NAMES,
      step: null,
      anchor: { shotId: null, strokeId: null },
      placement: NO_PLACEMENT,
      editable: true,
      onPlace: () => {},
      onTarget: () => {},
      onFlip: () => {},
      ...props,
    }),
  );
}

const text = (html: string, attr: string) =>
  new RegExp(`${attr}="[^"]*"[^>]*>([^<]*)<`).exec(html)?.[1];
/** The answers' buttons: [kind, id, words, opening tag]. */
const answersOf = (html: string) =>
  [
    ...html.matchAll(
      /<button[^>]*data-review-answer="([^"]*)" data-review-answer-id="([^"]*)"[^>]*>([^<]*)</g,
    ),
  ].map((m) => ({ kind: m[1], id: m[2], label: m[3], tag: m[0] }));

test.describe("the inline block", () => {
  const noop = () => {};

  test("a step: the question with n of m, the answers, the estimate box, Then — and one court on the right", () => {
    const point = acePoint();
    const step = stepOf(point);
    expect(step.item.id).toBe(4);
    const landing = setPlacementTarget(
      startPlacement("s-ace", "near"),
      "landing",
      -0.4,
    );
    const html = renderBlock({
      point,
      step,
      anchor: { shotId: "s-ace", strokeId: "s-ace" },
      placement: landing,
      count: { index: 1, total: 2 },
      onAnswer: noop,
      onEstimate: noop,
    });
    expect(tagOf(html, "data-review-inline=")).toContain(
      'data-review-inline="4"',
    );
    expect(text(html, "data-review-question")).toBe(step.question);
    expect(text(html, "data-review-count")).toBe("1 of 2");
    // The end being placed and whose side is on screen.
    expect(text(html, "data-review-side")).toBe("Landing · Vargas’s side");
    expect(answersOf(html).map((b) => [b.kind, b.label])).toEqual(
      step.answers.map((a) => [a.kind, a.label]),
    );
    // Text actions in the rail's inks: the suggested one amber, Dismiss quiet.
    const suggested = answersOf(html).find((b) => b.kind === "suggested");
    expect(suggested?.tag).toContain("text-[var(--rail-amber)]");
    const dismiss = answersOf(html).find((b) => b.kind === "dismiss");
    expect(dismiss?.tag).toContain("text-white/50");
    expect(html).toMatch(
      /data-review-estimate-box=""[\s\S]*?type="checkbox"[\s\S]*?Off screen, so this is an estimate</,
    );
    // Then: this is the point's only item, so none; the block says so by
    // drawing no line.
    expect(step.then).toBeNull();
    expect(html).not.toContain("data-review-then");
    // One court, on the right of the words, zoomed to the landing's half,
    // placing: the click surface with the labeller's zoom control.
    expect(html.indexOf("data-review-court")).toBeGreaterThan(
      html.indexOf("data-review-answers"),
    );
    expect(count(html, /data-court-view=/g)).toBe(1);
    expect(html).toContain('data-court-view="far"');
    expect(html).toMatch(/<button[^>]*data-court-target=""/);
    expect(html).toContain("data-court-zoom");
    expect(html).toContain('data-selected-ring="landing"');
    // Its Contact / Landing switch and Flip side sit under it.
    expect(html.indexOf("data-court-steps")).toBeGreaterThan(
      html.indexOf("data-review-court"),
    );
    expect(html).toContain("data-court-flip");
    // A data item: the quiet wash; a score item takes the amber one. No
    // stripe, no card.
    expect(step.item.tone).toBe("data");
    expect(tagOf(html, "data-review-inline=")).toContain("bg-white/[0.05]");
    expect(tagOf(html, "data-review-inline=")).not.toContain("border-l");
    expect(tagOf(html, "data-review-inline=")).not.toContain("rounded");
    const score = renderBlock({
      point,
      step: { ...step, item: { ...step.item, tone: "score" } },
      anchor: { shotId: "s-ace", strokeId: "s-ace" },
      placement: landing,
      count: { index: 1, total: 2 },
      onAnswer: noop,
    });
    expect(tagOf(score, "data-review-inline=")).toContain(
      "bg-[var(--rail-amber-wash-faint)]",
    );
    expect(tagOf(score, "data-review-count")).toContain(
      "text-[var(--rail-amber)]",
    );
  });

  test("a step whose stroke is not selected: the question, the whole court as a picture, no switch", () => {
    const point = acePoint();
    const html = renderBlock({
      point,
      step: stepOf(point),
      anchor: { shotId: "s-ace", strokeId: "s-ace" },
      onAnswer: noop,
      onEstimate: noop,
    });
    expect(html).toContain('data-court-view="whole"');
    expect(html).not.toContain("data-court-target");
    expect(html).not.toContain("data-court-steps");
    expect(html).not.toContain("data-review-estimate-box");
    expect(html).not.toContain("data-review-side");
    expect(answersOf(html).length).toBeGreaterThan(0);
    // The stroke alone, at full strength.
    expect(count(html, /data-court-hit=/g)).toBe(1);
    expect(count(html, /data-court-landed=/g)).toBe(1);
  });

  test("read-only: the step is drawn with no answers and no click surface", () => {
    const point = acePoint();
    const html = renderBlock({
      point,
      step: stepOf(point),
      anchor: { shotId: "s-ace", strokeId: "s-ace" },
      placement: startPlacement("s-ace", "near"),
      editable: false,
    });
    expect(html).toContain('data-review-inline="4"');
    expect(html).not.toContain("data-review-answers");
    expect(html).not.toContain("data-court-target");
  });

  test("a stroke placed with no step about it (the one an answer added): contact first, then the landing, the step kept as Then", () => {
    // The fixture's added forehand, as the add selects it: on its contact.
    const added = P1.shots.find((s) => s.id === "s-added")!;
    const point: LabelPoint = {
      ...P1,
      shots: P1.shots.map((s) =>
        s.id === "s-added"
          ? {
              ...s,
              contactX: null,
              contactY: null,
              landingX: null,
              landingY: null,
            }
          : s,
      ),
    };
    const step = {
      item: { id: 4, tone: "score", state: "open", members: [] },
      index: 1,
      total: 1,
      question: "How did the last ball end?",
      explanation: "x",
      target: { shotId: "s-return", place: "landing", slot: null },
      answers: [{ id: "in", label: "Winner", kind: "plain", writes: [] }],
      then: null,
      replay: null,
    } as unknown as ReviewStep;
    const contact = renderBlock({
      point,
      step,
      anchor: { shotId: added.id, strokeId: added.id },
      placement: startPlacement(added.id, "near"),
      count: { index: 1, total: 1 },
      onAnswer: noop,
      onEstimate: noop,
    });
    expect(contact).toContain('data-review-inline="placing"');
    expect(text(contact, "data-review-question")).toBe("Where was it hit?");
    expect(text(contact, "data-review-side")).toBe("Contact · Lee’s side");
    // Not the step's answers — it is about another stroke — but the step's
    // count: the added stroke is what is left of the step's question.
    expect(contact).not.toContain("data-review-answers");
    expect(contact).toContain("data-review-count");
    expect(text(contact, "data-review-then")).toBe(
      "Then: say how the last ball ended",
    );
    expect(contact).toMatch(/aria-pressed="true" data-court-step="contact"/);
    expect(contact).toMatch(/<button[^>]*data-court-target=""/);
    const landing = renderBlock({
      point,
      step,
      anchor: { shotId: added.id, strokeId: added.id },
      placement: setPlacementTarget(
        startPlacement(added.id, "near"),
        "landing",
      ),
      onEstimate: noop,
    });
    expect(text(landing, "data-review-question")).toBe("Where did it land?");
    expect(landing).toMatch(/aria-pressed="true" data-court-step="landing"/);
  });

  test("a short ball: the court slides across the net and the block says so, unless an answer does", () => {
    // Vargas's return bounces 3 m short of the net on his own side.
    const point: LabelPoint = {
      ...P1,
      shots: P1.shots.map((s) =>
        s.id === "s-return" ? { ...s, landingX: 0.5, landingY: 14.885 } : s,
      ),
    };
    const landing = setPlacementTarget(
      startPlacement("s-return", "far"),
      "landing",
      24.49,
    );
    const plain = {
      item: { id: 4, tone: "score", state: "open", members: [] },
      index: 1,
      total: 1,
      question: "How did the last ball end?",
      explanation: "x",
      target: { shotId: "s-return", place: "landing", slot: null },
      answers: [],
      then: null,
      replay: null,
    } as unknown as ReviewStep;
    const html = renderBlock({
      point,
      step: plain,
      anchor: { shotId: "s-return", strokeId: "s-return" },
      placement: landing,
      onAnswer: noop,
    });
    expect(html).toContain('data-court-slide="shank"');
    expect(text(html, "data-review-side")).toBe("Landing · across the net");
    expect(text(html, "data-review-shank")).toBe(
      "Didn’t clear the net · error by Vargas",
    );
    const said = renderBlock({
      point,
      step: {
        ...plain,
        answers: [
          { id: "short", label: "Didn’t clear", kind: "plain", writes: [] },
        ],
      } as ReviewStep,
      anchor: { shotId: "s-return", strokeId: "s-return" },
      placement: landing,
      onAnswer: noop,
    });
    expect(said).not.toContain("data-review-shank");
  });
});

/** A step about no stroke — a winner pick with nothing to replay. */
const pointLevel = (step: ReviewStep): ReviewStep => ({
  ...step,
  target: { shotId: null, place: null, slot: null },
  replay: null,
});

test.describe("where the block sits (`inlineReviewAnchor`)", () => {
  const point = acePoint();
  const step = stepOf(point);
  const ghosts = drawsGhosts(EMPTY_MARKS);

  test("with a step, its own target wins — whatever is selected", () => {
    expect(inlineReviewAnchor(point, step, NO_PLACEMENT, ghosts)).toEqual({
      shotId: "s-ace",
      strokeId: "s-ace",
    });
    // A stroke still selected (the one the last answer placed) does not
    // move the block off the step's stroke …
    expect(
      inlineReviewAnchor(P1, step, startPlacement("s-added", "near"), ghosts),
    ).toEqual({ shotId: "s-ace", strokeId: "s-ace" });
    // … and a step about no stroke sits at the well's end with it still
    // selected, so a winner pick after a placement is answerable.
    expect(
      inlineReviewAnchor(
        point,
        pointLevel(step),
        startPlacement("s-ace", "near"),
        ghosts,
      ),
    ).toEqual({ shotId: null, strokeId: null });
  });

  test("a stroke just added and not yet placed owns the court, contact first, even with a step open", () => {
    // "Add the shot" answered the step; its new stroke is what is left of it.
    const fresh = {
      ...P1,
      shots: P1.shots.map((shot) =>
        shot.id === "s-added"
          ? {
              ...shot,
              contactX: null,
              contactY: null,
              landingX: null,
              landingY: null,
            }
          : shot,
      ),
    };
    expect(
      inlineReviewAnchor(
        fresh,
        step,
        startPlacement("s-added", "near"),
        ghosts,
      ),
    ).toEqual({ shotId: "s-added", strokeId: "s-added" });
    // Contact placed, landing still to come: it keeps the court.
    const half = {
      ...fresh,
      shots: fresh.shots.map((shot) =>
        shot.id === "s-added"
          ? { ...shot, contactX: -2.3, contactY: -1.02 }
          : shot,
      ),
    };
    expect(
      inlineReviewAnchor(half, step, startPlacement("s-added", "far"), ghosts),
    ).toEqual({ shotId: "s-added", strokeId: "s-added" });
  });

  test("no step: the selected live stroke (the one an answer added), else no block", () => {
    expect(inlineReviewAnchor(point, null, NO_PLACEMENT, ghosts)).toBeNull();
    expect(
      inlineReviewAnchor(P1, null, startPlacement("s-added", "near"), ghosts),
    ).toEqual({ shotId: "s-added", strokeId: "s-added" });
    expect(
      inlineReviewAnchor(P1, null, startPlacement("s-return", "far"), ghosts),
    ).toEqual({ shotId: "s-return", strokeId: "s-return" });
    // A selection that is not one of the point's live strokes is ignored.
    expect(
      inlineReviewAnchor(P1, null, startPlacement("s-phantom", "near"), ghosts),
    ).toBeNull();
  });

  test("a point-level step draws its answers while a stroke is still selected: the block is the step's, not the placement's", () => {
    const step = pointLevel(stepOf(point));
    const html = renderBlock({
      point,
      step,
      anchor: { shotId: null, strokeId: null },
      placement: startPlacement("s-ace", "near"),
      count: { index: 2, total: 2 },
      onAnswer: () => {},
    });
    expect(text(html, "data-review-question")).toBe(step.question);
    expect(answersOf(html).map((a) => a.id)).toEqual(
      step.answers.map((a) => a.id),
    );
    expect(html).toContain('data-review-inline="4"');
    // Nothing is being placed on it: no court controls, no placing line.
    expect(html).not.toContain("data-court-steps");
    expect(html).not.toContain("data-review-side");
  });
});

test.describe("the placement prompt numbers the stroke as the rail does", () => {
  const p4 = labelSessionFixture().points.find(
    (point) => point.id === FIXTURE_POINT_IDS.P4,
  )!;
  const promptOf = (shotId: string, ghosts: boolean) =>
    text(
      renderBlock({
        point: p4,
        anchor: { shotId, strokeId: shotId },
        placement: startPlacement(shotId, "near"),
        ghosts,
      } as Partial<BlockProps> & { point: LabelPoint }),
      "data-review-prompt",
    );

  test("a ghost before the stroke takes no number while ghosts are drawn, and a ghost itself has none", () => {
    expect(promptOf("s-p4-serve", true)).toBe("Click where shot 2 was hit");
    expect(promptOf("s-p4-serve", false)).toBe("Click where shot 3 was hit");
    // The ghost selected while drawn as one: no number, so no prompt.
    expect(promptOf("s-p4-ghost", true)).toBe("");
    expect(promptOf("s-p4-ghost", false)).toBe("Click where shot 2 was hit");
  });

  test("Contact / Landing and Flip side share one 24px row, as under the court panel", () => {
    const html = renderBlock({
      point: p4,
      anchor: { shotId: "s-p4-serve", strokeId: "s-p4-serve" },
      placement: startPlacement("s-p4-serve", "near"),
    });
    expect(html).toContain(
      '<div class="flex h-6 items-center gap-3"><span role="group"',
    );
    expect(html).toContain("data-court-flip");
  });

  test("the well draws it under that stroke's row, after its suggestion rows; at the end with no stroke", () => {
    const { BlackShotsWell } = createLoader().load(
      "src/components/admin/labels/label-black-shot-row.tsx",
    ) as { BlackShotsWell: React.ComponentType<Record<string, unknown>> };
    const node = React.createElement("div", { "data-stub-inline": "" });
    const under = renderToStaticMarkup(
      React.createElement(BlackShotsWell, {
        point: P1,
        edit: editContext(),
        inline: { afterShotId: "s-return", node },
        animate: false,
      }),
    );
    const at = under.indexOf("data-stub-inline");
    expect(at).toBeGreaterThan(under.indexOf('data-shot-id="s-return"'));
    expect(at).toBeLessThan(under.indexOf('data-shot-id="s-added"'));
    expect(count(under, /data-stub-inline/g)).toBe(1);
    const end = renderToStaticMarkup(
      React.createElement(BlackShotsWell, {
        point: P1,
        edit: editContext(),
        inline: { afterShotId: null, node },
        animate: false,
      }),
    );
    expect(end.indexOf("data-stub-inline")).toBeGreaterThan(
      end.lastIndexOf("data-shot-id="),
    );
    expect(end.indexOf("data-stub-inline")).toBeLessThan(
      end.indexOf("data-add-shot"),
    );
    expect(
      renderToStaticMarkup(
        React.createElement(BlackShotsWell, {
          point: P1,
          edit: editContext(),
          animate: false,
        }),
      ),
    ).not.toContain("data-stub-inline");
  });
});

test("n of m counts from the point's opening total: answering moves 1 of 2 to 2 of 2", () => {
  const opened = openedCount(NO_OPENED_COUNT, "p", { total: 2 });
  expect(stepCount(opened, { total: 2 })).toEqual({ index: 1, total: 2 });
  const after = openedCount(opened, "p", { total: 1 });
  expect(after).toBe(opened);
  expect(stepCount(after, { total: 1 })).toEqual({ index: 2, total: 2 });
  expect(openedCount(after, "q", { total: 1 })).toEqual({
    pointId: "q",
    total: 1,
  });
  expect(openedCount(after, "p", null)).toBe(NO_OPENED_COUNT);
  expect(openedCount(NO_OPENED_COUNT, null, null)).toBe(NO_OPENED_COUNT);
  expect(openedCount(after, "p", { total: 3 })).toEqual({
    pointId: "p",
    total: 3,
  });
});

test.describe("the court panel's information line (`pointInfoLine`)", () => {
  test("score · server · how far the rally has got · what is to review", () => {
    expect(
      pointInfoLine({
        score: "30–15",
        server: "Lee",
        rallyLength: 5,
        rallySoFar: 3,
        openItems: 2,
      }),
    ).toBe("30–15 · Lee serving · shot 3 of 5 · 2 to review");
  });

  test("nothing playing: the rally's length; nulls dropped; nothing open says nothing", () => {
    expect(
      pointInfoLine({
        score: null,
        server: null,
        rallyLength: 1,
        rallySoFar: null,
        openItems: 0,
      }),
    ).toBe("1 shot");
    expect(
      pointInfoLine({
        score: "Game–30",
        server: "Vargas",
        rallyLength: 0,
        rallySoFar: null,
        openItems: 1,
      }),
    ).toBe("Game–30 · Vargas serving · no shots · 1 to review");
  });
});
