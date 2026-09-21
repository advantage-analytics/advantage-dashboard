import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

const source = readFileSync("src/components/ui/float-menu.tsx", "utf8");

test.describe("FloatMenuItem selected-option treatment", () => {
  test("marks selection with a blue check without a persistent or pointer-hover wash", () => {
    expect(source).toContain('role={isAction ? "menuitem" : "menuitemradio"}');
    expect(source).toContain(
      "aria-checked={isAction ? undefined : resolvedChosen}",
    );
    expect(source).toContain(
      '"focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none"',
    );
    expect(source).toContain(
      '!resolvedChosen && "hover:bg-[var(--surface-subtle)]"',
    );
    expect(source).not.toContain('chosen && "bg-[var(--surface-subtle)]"');
  });

  test("keeps pointer hover for unselected options and menu semantics for actions", () => {
    expect(source).toContain("{icon ? (");
    // A select row's check is the shared right-edge `ChosenCheck`; an action
    // row (one with an icon, a trailing glyph, or no `chosen` at all) has no
    // chosen mark.
    expect(source).toContain("export function ChosenCheck");
    expect(source).toContain(
      '!icon && <ChosenCheck chosen={resolvedChosen} className="mt-[2px]" />',
    );
    expect(source).toContain("text-[var(--blue)]");
  });

  test("an action row is any row without an explicit `chosen`, not just an icon row", () => {
    // Fix round 1: `chosen === undefined` — omitted entirely, the film
    // wrapper's documented "omit chosen for an action row" — must also read
    // as an action row (`role=\"menuitem\"`, no check slot), not just an
    // `icon`/`trailing` row.
    expect(source).toContain(
      "icon != null || trailing != null || chosen === undefined",
    );
  });
});
