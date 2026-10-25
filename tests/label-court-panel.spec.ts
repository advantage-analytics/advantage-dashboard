import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  flipPlacement,
  setPlacementTarget,
  startPlacement,
  type PlacementState,
} from "@/components/admin/labels/court-placement";
import type { PointInfo } from "@/components/admin/labels/label-point-info";
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
  info?: PointInfo | null;
  notice?: string | null;
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

/** The header's title as read: its text, tags stripped, glyph and all. */
const title = (html: string) => {
  const start = html.indexOf("data-court-title");
  const end = html.indexOf("data-court-subtitle");
  if (start === -1 || end === -1) return undefined;
  const inner = html.slice(html.indexOf(">", start) + 1, end);
  return inner
    .slice(0, inner.lastIndexOf("</span>"))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};
/** A cursor data URI's SVG, read back out of the markup's escaping. */
const cursorSvg = (tag: string) =>
  decodeURIComponent(tag.replace(/&#x27;/g, "'").replace(/&quot;/g, '"'));
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
    expect(title(html)).toBe("Click where shot 2 was hit");
    expect(subtitle(html)).toBe("Vargas’s side");
    expect(html).toMatch(
      /data-court-prompt=""[^>]*>Click where shot 2 was hit</,
    );
    expect(html).toMatch(
      /aria-pressed="true" data-court-step="contact"[^>]*><span aria-hidden="true" data-end-glyph="contact"[^>]*><\/span>Contact</,
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
    expect(title(html)).toBe("Click where shot 1 was hit · let");
    const other = render({
      point: withLet,
      placement: startPlacement("s-return", "far"),
    });
    expect(title(other)).toBe("Click where shot 2 was hit");
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
    expect(title(html)).toBe("Click where shot 2 landed");
    expect(subtitle(html)).toBe("Lee’s side");
    expect(html).toMatch(
      /aria-pressed="true" data-court-step="landing"[^>]*><span aria-hidden="true" data-end-glyph="landing"[^>]*><\/span>Landing</,
    );
    expect(html).toMatch(/aria-pressed="false" data-court-flip=""/);
    expect(html).toContain('data-selected-ring="landing"');

    const flipped = render({ placement: flipPlacement(landing) });
    expect(flipped).toContain('data-court-view="far"');
    expect(subtitle(flipped)).toBe("Flipped to Vargas’s side · Net");
    expect(flipped).toMatch(/aria-pressed="true" data-court-flip=""/);
  });

  test("the prompt is drawn, not screen-reader only, after its end's glyph; absent with nothing selected", () => {
    const html = render({ placement: startPlacement("s-return", "far") });
    const prompt = tagOf(html, "data-court-prompt");
    expect(prompt).not.toContain("sr-only");
    expect(prompt).toContain('aria-live="polite"');
    const titleTag = tagOf(html, "data-court-title");
    expect(titleTag).toContain("text-[13px]");
    expect(titleTag).toContain("font-medium");
    // The 9px glyph leads the title: a hollow ring for a contact…
    expect(html).toMatch(
      /data-court-title=""[^>]*><span aria-hidden="true" data-end-glyph="contact" class="[^"]*border-\[1\.5px\][^"]*size-\[9px\]/,
    );
    // …a filled dot for a landing.
    const landing = render({
      placement: setPlacementTarget(
        startPlacement("s-return", "far"),
        "landing",
      ),
    });
    expect(landing).toMatch(
      /data-court-title=""[^>]*><span aria-hidden="true" data-end-glyph="landing" class="[^"]*bg-current[^"]*size-\[9px\]/,
    );
    for (const idle of [
      render({}),
      render({ playingShotId: "s-return" }),
      render({ placement: startPlacement("s-return", "far"), editable: false }),
    ]) {
      expect(idle).not.toContain("data-court-prompt");
      expect(idle).not.toContain("data-end-glyph");
    }
  });

  test("the switch's buttons carry the end glyphs: a 7px ring for Contact, a 6px dot for Landing", () => {
    const html = render({ placement: startPlacement("s-return", "far") });
    expect(html).toMatch(
      /data-court-step="contact"[^>]*><span aria-hidden="true" data-end-glyph="contact" class="[^"]*border-\[1\.5px\][^"]*size-\[7px\]/,
    );
    expect(html).toMatch(
      /data-court-step="landing"[^>]*><span aria-hidden="true" data-end-glyph="landing" class="[^"]*bg-current[^"]*size-1\.5/,
    );
  });

  test("the half's box carries the end's cursor: its glyph as an SVG data URI, the crosshair behind", () => {
    const html = render({ placement: startPlacement("s-return", "far") });
    const box = tagOf(html, "data-court-target");
    expect(box).toContain('data-court-cursor="contact"');
    expect(box).toMatch(
      /cursor:url\(&quot;data:image\/svg\+xml,[^)]*\) 12 12, crosshair/,
    );
    // The ring: a hollow circle, no fill.
    expect(cursorSvg(box)).toContain(
      "<circle cx='12' cy='12' r='5' stroke='white' stroke-width='1.5'/>",
    );
    const landing = tagOf(
      render({
        placement: setPlacementTarget(
          startPlacement("s-return", "far"),
          "landing",
        ),
      }),
      "data-court-target",
    );
    expect(landing).toContain('data-court-cursor="landing"');
    expect(cursorSvg(landing)).toContain(
      "<circle cx='12' cy='12' r='3' fill='white'/>",
    );
    expect(render({})).not.toContain("data-court-cursor");
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

test.describe("the point's information line", () => {
  const INFO: PointInfo = {
    score: "30–15",
    server: "Lee",
    rallyLength: 3,
    rallySoFar: 2,
    openItems: 2,
  };

  test("not placing: one quiet line under the header; absent without one", () => {
    const html = render({ info: INFO, playingShotId: "s-return" });
    expect(html).toMatch(
      /data-court-info=""[^>]*>30–15 · Lee serving · shot 2 of 3 · 2 to review</,
    );
    expect(tagOf(html, "data-court-info")).toContain("text-white/55");
    // Under the header, above the court.
    expect(html.indexOf("data-court-info")).toBeGreaterThan(
      html.indexOf("data-court-subtitle"),
    );
    expect(html.indexOf("data-court-info")).toBeLessThan(
      html.indexOf("data-court-box"),
    );
    expect(render({ playingShotId: "s-return" })).not.toContain(
      "data-court-info",
    );
    expect(render({ info: null })).toBe(render({}));
  });

  test("placing: the foot takes the room, the line is not drawn", () => {
    const html = render({
      info: INFO,
      placement: startPlacement("s-return", "far"),
    });
    expect(html).not.toContain("data-court-info");
    expect(html).toContain("data-court-steps");
    expect(html).toContain("data-court-keys");
  });

  test("the review step is never drawn here: no column, no answers", () => {
    const html = render({ info: INFO });
    expect(html).not.toContain("data-court-review");
    expect(html).not.toContain("data-court-layout");
    expect(html).not.toContain("data-court-side");
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

  test("a half's own box draws its run-off guides by default, labelled", () => {
    // Nothing placed yet, no slide: the far half's own 3.5 m run-off.
    const html = render({ placement: startPlacement("s-return", "far") });
    expect(html).not.toContain("data-court-slide");
    expect(
      [...html.matchAll(/data-court-guide="(\d+)"[^>]*>([^<]*)</g)].map((m) => [
        m[1],
        m[2],
      ]),
    ).toEqual([["2", "+2 m"]]);
    expect(html).toContain('data-court-runoff="far"');
    expect(html).toContain("data-court-usual-edge-line");
    expect(html).toMatch(/data-court-usual-edge=""[^>]*>usual edge</);
    // Kept at their size under the court's own zoom, like the marks.
    expect(tagOf(html, 'data-court-guide="2"')).toContain("scale(1.000)");
    // The whole court draws none.
    const whole = render({ placement: startPlacement(null) });
    expect(whole).not.toContain("data-court-guide");
    expect(whole).not.toContain("data-court-usual-edge");
  });

  test("“Landing placed · next: shot N contact” in the subtitle's place, only when given", () => {
    const notice = "Landing placed · next: shot 2 contact";
    const html = render({
      placement: startPlacement("s-return", "far"),
      notice,
    });
    expect(html).toMatch(
      /data-placement-notice=""[^>]*>Landing placed · next: shot 2 contact</,
    );
    // After a contact the console passes none: the usual subtitle.
    const after = render({
      placement: setPlacementTarget(
        startPlacement("s-return", "far"),
        "landing",
      ),
    });
    expect(after).not.toContain("data-placement-notice");
    // Not placing (read-only), a notice is not drawn.
    expect(
      render({
        placement: startPlacement("s-return", "far"),
        editable: false,
        notice,
      }),
    ).not.toContain("data-placement-notice");
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
