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
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The labelling console's court (board 08i's body, `label-court-panel.tsx`),
 * rendered offline through `fixtures/vm-modules` in each of its states: the
 * two-line readout, the whole court or the half a click belongs on, and the
 * foot. The blue outline while placing is the view's — the docked card's
 * (`label-side-view.tsx`) and the full screen's (`label-black-view.tsx`).
 */

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

/** The opening tag that carries `needle`. */
function tagOf(html: string, needle: string): string {
  const at = html.indexOf(needle);
  expect(at, needle).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
}

test.describe("the court panel", () => {
  test("not placing: the whole court, read-only, the playing stroke named", () => {
    const html = render({ playingShotId: "s-return" });
    expect(html).toContain('data-court-view="whole"');
    expect(html).toContain('viewBox="-7.265 -4.5 14.53 32.77"');
    expect(html).not.toContain('<button type="button" data-court-target');
    expect(html).not.toContain("data-court-steps");
    expect(html).toContain("data-court-legend");
    expect(title(html)).toBe("Point 1");
    expect(subtitle(html)).toBe("Shot 2 of 3 · Vargas");
    // A plain header — nothing to drag, nothing to minimise — and no list of
    // the point's shots.
    expect(html).not.toContain("data-court-handle");
    expect(html).not.toContain("Minimise the court");
    expect(html).not.toContain("Expand the court");
    expect(html).not.toContain("First serve");
    expect(html).not.toContain("Backhand");
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

  test("the court's box takes the panel's height and is its size container", () => {
    const box = /class="([^"]*)"/
      .exec(tagOf(render({}), "data-court-box"))![1]
      .split(/\s+/);
    expect(box).not.toContain("h-[222px]");
    for (const token of ["[container-type:size]", "min-h-0", "flex-1"]) {
      expect(box, token).toContain(token);
    }
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

  test("docked: the court card wears it, round the card's own shadow", () => {
    const file = "src/components/admin/labels/label-side-view.tsx";
    const on = tagOf(
      view(file, "LabelSideView", true),
      "data-label-side-court",
    );
    expect(on).toContain('data-court-placing="true"');
    expect(on).toContain("shadow-[0_0_0_1.5px_var(--blue),var(--shadow-card)]");
    const off = tagOf(
      view(file, "LabelSideView", false),
      "data-label-side-court",
    );
    expect(off).toContain('data-court-placing="false"');
    expect(off).not.toContain("var(--blue)");
  });

  test("full screen: on the inside, there being no card edge to carry it", () => {
    const file = "src/components/admin/labels/label-black-view.tsx";
    const on = tagOf(
      view(file, "LabelBlackView", true),
      "data-label-black-court",
    );
    expect(on).toContain('data-court-placing="true"');
    expect(on).toContain("shadow-[inset_0_0_0_1.5px_var(--blue)]");
    const off = tagOf(
      view(file, "LabelBlackView", false),
      "data-label-black-court",
    );
    expect(off).toContain('data-court-placing="false"');
    expect(off).not.toContain("var(--blue)");
  });
});
