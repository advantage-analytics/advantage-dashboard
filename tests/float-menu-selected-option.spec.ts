import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

const source = readFileSync("src/components/ui/float-menu.tsx", "utf8");

test.describe("FloatMenuItem selected-option treatment", () => {
  test("marks selection with a blue check without a persistent or pointer-hover wash", () => {
    expect(source).toContain('role={icon ? "menuitem" : "menuitemradio"}');
    expect(source).toContain("aria-checked={icon ? undefined : chosen}");
    expect(source).toContain(
      '"focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none"',
    );
    expect(source).toContain('!chosen && "hover:bg-[var(--surface-subtle)]"');
    expect(source).not.toContain('chosen && "bg-[var(--surface-subtle)]"');
  });

  test("keeps pointer hover for unselected options and menu semantics for actions", () => {
    expect(source).toContain("{icon ? (");
    expect(source).toContain("<Check");
    expect(source).toContain("text-[var(--blue)]");
  });
});
