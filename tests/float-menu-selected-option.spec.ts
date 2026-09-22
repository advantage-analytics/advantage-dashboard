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
    expect(source).toContain("{hasIcon ? (");
    // A select row's check is the shared right-edge `ChosenCheck`. The gutter
    // draws for every selectable row and for a plain action row with no
    // leading glyph; an icon-only action row gets nothing.
    expect(source).toContain("export function ChosenCheck");
    expect(source).toContain("(!isAction || !hasIcon) && (");
    expect(source).toContain(
      '<ChosenCheck chosen={resolvedChosen} className="mt-[2px]" />',
    );
    expect(source).toContain("text-[var(--blue)]");
  });

  test("an action row is any row without an explicit `chosen`, not just an icon row", () => {
    // Fix round 1: `chosen === undefined` — omitted entirely, the film
    // wrapper's documented "omit chosen for an action row" — must also read
    // as an action row (`role=\"menuitem\"`, no check slot), not just an
    // `icon`/`trailing` row.
    //
    // Final review #8: a leading ICON no longer forces an action row. The
    // chart menu's Heat row carries a flame glyph AND is selectable, and
    // suppressing its check left the one chart row that could not show it was
    // chosen. An icon says what the row IS; the check says whether it is
    // picked.
    expect(source).toContain(
      "const isAction = trailing != null || chosen === undefined;",
    );
    expect(source).not.toContain("icon != null || trailing != null");
  });

  test("`icon={false}` is not an icon", () => {
    // `icon={cond && <X/>}` with a false condition used to count as an icon —
    // silently turning a select row into an action one and leaving an empty
    // 12px leading slot.
    expect(source).toContain("const hasIcon = Boolean(icon);");
  });
});
