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
  reviewNoteText,
  stepCount,
} from "@/components/admin/labels/label-review-inline";
import type { LabelMarks } from "@/lib/services/labels/marks";
import { drawsGhosts } from "@/lib/services/labels/marks-state";
import {
  reviewItemThenLabel,
  reviewStep,
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
 * The review step noted in the rail: one line under the stroke it is about
 * saying what to fix (`ReviewNote`), where it sits (`inlineReviewAnchor`),
 * and the court panel's information line (`pointInfoLine`). The court panel
 * is the one placement surface; the note has no court and no answers.
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

type NoteProps = {
  step: ReviewStep | null;
  anchor: { shotId: string | null; strokeId: string | null };
  placement: PlacementState;
  count: { index: number; total: number } | null;
};

function renderNote(props: Partial<NoteProps>) {
  const { ReviewNote } = createLoader().load(
    "src/components/admin/labels/label-review-inline.tsx",
  ) as { ReviewNote: React.ComponentType<NoteProps> };
  return renderToStaticMarkup(
    React.createElement(ReviewNote, {
      step: null,
      anchor: { shotId: null, strokeId: null },
      placement: NO_PLACEMENT,
      count: null,
      ...props,
    }),
  );
}

const capitalised = (words: string) =>
  words.charAt(0).toUpperCase() + words.slice(1);

test.describe("the review note", () => {
  test("a stroke end to place says which, on the court panel's terms", () => {
    expect(reviewNoteText(null, startPlacement("s-ace", "near"), "s-ace")).toBe(
      "Place where it was hit",
    );
    expect(
      reviewNoteText(
        null,
        setPlacementTarget(startPlacement("s-ace", "near"), "landing"),
        "s-ace",
      ),
    ).toBe("Place where it landed");
    // Another stroke being placed is not this note's.
    expect(
      reviewNoteText(null, startPlacement("s-other", "near"), "s-ace"),
    ).toBe(null);
  });

  test("a step names the fix its item calls for", () => {
    const point = acePoint();
    const step = stepOf(point);
    expect(reviewNoteText(step, NO_PLACEMENT, null)).toBe(
      capitalised(reviewItemThenLabel(step.item)),
    );
  });

  test("one line: the fix, n of m when there are several, amber for the score — no court, no answers", () => {
    const point = acePoint();
    const step = stepOf(point);
    const html = renderNote({ step, count: { index: 2, total: 3 } });
    expect(html).toContain(capitalised(reviewItemThenLabel(step.item)));
    expect(html).toContain("2 of 3");
    expect(html).toContain(`data-review-inline="${step.item.id}"`);
    if (step.item.tone === "score") {
      expect(html).toContain("bg-[var(--rail-amber-wash)]");
    }
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<button");
    // One question alone counts nothing.
    expect(renderNote({ step, count: { index: 1, total: 1 } })).not.toContain(
      " of 1",
    );
    // Nothing to fix and nothing being placed: no line at all.
    expect(renderNote({})).toBe("");
  });
});

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
});

test.describe("where the note is drawn", () => {
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
