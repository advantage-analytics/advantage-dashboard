import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { floatMenuToneClasses } from "@/components/ui/float-menu";

const source = readFileSync("src/components/ui/float-menu.tsx", "utf8");

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

test("a disabled+chosen dark row drops its persistent wash", () => {
  // Fix round 1, item 3: source-string check (no DOM here) that the fix
  // exists — `disabled && "bg-transparent"` sits after the dark
  // chosen/hover branch so tailwind-merge's last-write-wins clears the
  // persistent `bg-white/[0.08]` chosen wash when the row is also disabled.
  expect(source).toContain('disabled && "bg-transparent"');
});
