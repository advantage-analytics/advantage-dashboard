import { expect, test } from "@playwright/test";
import { floatMenuToneClasses } from "@/components/ui/float-menu";

/**
 * Task 3: the pure surface-class helper behind `FloatMenu`'s `tone` prop.
 * Render-free — `floatMenuToneClasses` is the one piece of the dark-tone
 * work that doesn't need a DOM, so it's tested directly rather than via a
 * source-string check (unlike `tests/float-menu-selected-option.spec.ts`).
 */

test("floatMenuToneClasses returns the light surface unchanged", () => {
  expect(floatMenuToneClasses("light")).toBe(
    "rounded-[10px] p-[5px] shadow-[0px_6px_20px_0px_rgba(0,0,0,0.12)]",
  );
  // The default (no argument) is the same light surface.
  expect(floatMenuToneClasses()).toBe(
    "rounded-[10px] p-[5px] shadow-[0px_6px_20px_0px_rgba(0,0,0,0.12)]",
  );
});

test("floatMenuToneClasses returns the dark f4b-report P2d/P2e surface", () => {
  const dark = floatMenuToneClasses("dark");
  expect(dark).toContain("rounded-[10px]");
  expect(dark).toContain("p-[5px]");
  // rgba(13,13,13,.88), never a hex literal.
  expect(dark).toContain("bg-[rgba(13,13,13,0.88)]");
  expect(dark).toContain("border-white/10");
  expect(dark).toContain("backdrop-blur-[10px]");
  expect(dark).toContain("shadow-[var(--shadow-dropdown)]");
  expect(dark).not.toContain("#");
});

test("light and dark are distinct strings", () => {
  expect(floatMenuToneClasses("light")).not.toBe(floatMenuToneClasses("dark"));
});
