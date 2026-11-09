import { expect, test } from "@playwright/test";

import { filterPanelSurfaceClasses } from "@/components/dashboard/matches/matches-filter-panel";
import { floatMenuToneClasses } from "@/components/ui/float-menu";

/**
 * The Matches list's filter panel keeps its own 18a box; only a host that
 * asks for the float-menu surface (the Visualizations lightbox) gets it.
 */
test("the Matches list panel's surface classes are unchanged", () => {
  const shipped =
    "flex max-h-[var(--radix-popover-content-available-height)] w-[min(272px,var(--radix-popover-content-available-width))] flex-col overflow-y-auto rounded-xl border-[var(--border-medium)] p-1.5 shadow-[var(--shadow-dropdown)]";
  expect(filterPanelSurfaceClasses()).toBe(shipped);
  expect(filterPanelSurfaceClasses("panel")).toBe(shipped);
});

test("the menu surface is FloatMenu's light surface over the same layout", () => {
  const menu = filterPanelSurfaceClasses("menu");
  expect(menu).toContain(floatMenuToneClasses("light"));
  expect(menu).toContain("rounded-[10px] p-[5px]");
  expect(menu).not.toContain("rounded-xl");
  expect(menu).not.toContain("border-[var(--border-medium)]");
  expect(menu).not.toContain("p-1.5");
});
