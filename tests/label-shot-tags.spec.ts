import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  shotTagForKey,
  tagKeyPatch,
} from "@/components/admin/labels/stroke-keys";
import {
  applyLabelShotPatch,
  labelShotStatusAfterPatch,
  parseLabelShotPatch,
} from "@/lib/services/labels/edit";
import { toLabelShot, type LabelShotRow } from "@/lib/services/labels/rows";
import {
  LABEL_SHOT_TAGS,
  toggledShotTags,
  type LabelPoint,
  type LabelShot,
} from "@/lib/services/labels/session";
import { tag, text } from "./fixtures/html-probe";
import {
  editContext,
  labelPoint,
  labelSessionFixture,
  labelShot,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * Shot kinds on labelled strokes (`label_shots.tags`): approach, lob, drop
 * shot, passing. The labeller's answer key for the report's net-game rules.
 * A tag is not a value field: it never moves a stroke's kept / edited status,
 * which measures the vendor's reading.
 */

const SEED = {
  hitter: "p1" as const,
  stroke: "forehand" as const,
  result: "in" as const,
  spin: "topspin" as const,
  contact_x: 1,
  contact_y: -8,
  landing_x: 0.5,
  landing_y: 18,
  video_time: 100,
};

test.describe("the tags patch", () => {
  test("takes the four kinds, deduplicated, in the vocabulary's order", () => {
    expect(LABEL_SHOT_TAGS).toEqual([
      "approach",
      "lob",
      "drop_shot",
      "passing",
    ]);
    const parsed = parseLabelShotPatch({
      tags: ["passing", "approach", "passing"],
    });
    expect(parsed).toEqual({
      ok: true,
      patch: { tags: ["approach", "passing"] },
    });
    expect(parseLabelShotPatch({ tags: [] })).toEqual({
      ok: true,
      patch: { tags: [] },
    });
  });

  test("refuses anything that is not a list of known kinds", () => {
    for (const tags of [["smash"], "lob", null, [1], ["Lob"]]) {
      const parsed = parseLabelShotPatch({ tags });
      expect(parsed, JSON.stringify(tags)).toEqual({
        error: "Tags must list shot kinds: approach, lob, drop_shot, passing.",
      });
    }
  });

  test("never moves the status: a tagged kept stroke stays kept", () => {
    const current = { ...SEED, status: "kept" as const, seed: SEED };
    expect(labelShotStatusAfterPatch(current, { tags: ["lob"] })).toBe("kept");
    // With a seed the status is read off the values alone, the tag ignored;
    // a real value change still edits.
    expect(
      labelShotStatusAfterPatch(
        { ...current, status: "edited" },
        { tags: ["lob"] },
      ),
    ).toBe("kept");
    expect(
      labelShotStatusAfterPatch(current, { tags: ["lob"], spin: "flat" }),
    ).toBe("edited");
  });

  test("the console's optimistic apply writes the list", () => {
    const shot = labelShot("s", "p", { stroke: "forehand" });
    const next = applyLabelShotPatch(shot, { tags: ["approach"] });
    expect(next.tags).toEqual(["approach"]);
    expect(next.status).toBe("kept");
    expect(applyLabelShotPatch(next, { tags: [] }).tags).toEqual([]);
  });
});

test.describe("the stored row", () => {
  const row = (tags: unknown): LabelShotRow =>
    ({
      id: "s",
      label_point_id: "p",
      event_id: 1,
      after_event_id: null,
      status: "kept",
      status_before_delete: null,
      delete_reason: null,
      hitter: "p1",
      stroke: "forehand",
      result: "in",
      spin: null,
      contact_x: null,
      contact_y: null,
      landing_x: null,
      landing_y: null,
      video_time: null,
      tags,
      site_removal: null,
      site_removal_restored_at: null,
    }) as LabelShotRow;

  test("reads the column in order, and a read without it as none", () => {
    expect(toLabelShot(row(["passing", "lob"])).tags).toEqual([
      "lob",
      "passing",
    ]);
    expect(toLabelShot(row(null)).tags).toEqual([]);
    expect(toLabelShot(row(undefined)).tags).toEqual([]);
  });
});

test.describe("the keys", () => {
  test("G approach, K lob, J drop shot, P passing; either case", () => {
    expect(shotTagForKey("g")).toBe("approach");
    expect(shotTagForKey("K")).toBe("lob");
    expect(shotTagForKey("j")).toBe("drop_shot");
    expect(shotTagForKey("P")).toBe("passing");
    for (const key of ["l", "e", "Enter", "1", "gg"]) {
      expect(shotTagForKey(key), key).toBeNull();
    }
  });

  test("a key toggles its kind on a rally stroke and leaves the others", () => {
    const shot = { stroke: "forehand" as const, tags: [] as LabelShot["tags"] };
    expect(tagKeyPatch(shot, "lob")).toEqual({ tags: ["lob"] });
    expect(tagKeyPatch({ ...shot, tags: ["lob"] }, "lob")).toEqual({
      tags: [],
    });
    expect(tagKeyPatch({ ...shot, tags: ["passing"] }, "lob")).toEqual({
      tags: ["lob", "passing"],
    });
    expect(toggledShotTags(["approach", "lob"], "approach")).toEqual(["lob"]);
  });

  test("a serve and an untyped stroke take no kind", () => {
    expect(
      tagKeyPatch({ stroke: "first_serve", tags: [] }, "approach"),
    ).toBeNull();
    expect(tagKeyPatch({ stroke: null, tags: [] }, "approach")).toBeNull();
  });
});

test.describe("the shots well", () => {
  const WELL = "src/components/admin/labels/label-black-shot-row.tsx";

  function render(selectedShotId: string, patches: unknown[] = []): string {
    const { BlackShotsWell } = createLoader().load(WELL) as {
      BlackShotsWell: (props: {
        point: LabelPoint;
        edit: Record<string, unknown>;
      }) => React.ReactElement;
    };
    const point = labelPoint("p", 0, {
      id: "p-tags",
      vendorRallyIds: [],
      shots: [
        labelShot("t-serve", "p", {
          stroke: "first_serve",
          result: "in",
          videoTime: 10,
        }),
        labelShot("t-approach", "p", {
          hitter: "p2",
          stroke: "backhand",
          result: "in",
          videoTime: 11,
          tags: ["approach", "passing"],
        }),
      ],
    });
    return renderToStaticMarkup(
      React.createElement(BlackShotsWell, {
        point,
        edit: {
          ...editContext({}, labelSessionFixture()),
          selectedShotId,
          onPatchShot: (_id: string, patch: unknown) => patches.push(patch),
        },
      }),
    );
  }

  test("the Kind cell reads the stored kinds, a dash when there are none", () => {
    const html = render("t-approach");
    const cells = [...html.matchAll(/data-shot-kind=""[^>]*>(.*?)<\/span>/g)];
    expect(cells).toHaveLength(2);
    // A serve takes no kind: its cell is empty, not a dash.
    expect(text(cells[0][1])).toBe("");
    expect(html).not.toContain("No kind");
    expect(cells[1][1]).toBe("Approach · Passing");
    // It leaves with placement on a narrow well.
    expect(tag(html, "data-shot-kind")).toContain("@max-[640px]/shots:hidden");
  });

  test("a rally stroke's strip: four toggles with their keys, the stored ones pressed", () => {
    const html = render("t-approach");
    const strip = html.slice(html.indexOf("data-shot-kind-strip"));
    expect(tag(html, "data-shot-kind-strip")).toContain(
      'aria-label="Shot 2 kind"',
    );
    expect(text(strip.slice(strip.indexOf(">") + 1))).toContain(
      "Kind Approach G Lob K Drop shot J Passing P",
    );
    for (const [kind, pressed] of [
      ["approach", true],
      ["lob", false],
      ["drop_shot", false],
      ["passing", true],
    ] as const) {
      expect(tag(html, `data-shot-tag="${kind}"`)).toContain(
        `aria-pressed="${pressed}"`,
      );
    }
  });

  test("a serve has no strip", () => {
    expect(render("t-serve")).not.toContain("data-shot-kind-strip");
  });
});
