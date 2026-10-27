import { expect, test } from "@playwright/test";

import { readFileSync } from "node:fs";

import { createLoader } from "./fixtures/vm-modules";

import {
  LABEL_SHORTCUT_GROUPS,
  isShortcutSheetKey,
} from "@/components/admin/labels/label-shortcuts";

/**
 * The label console's shortcut sheet (label-shortcuts.ts and its dialog) and
 * the Esc that lets go of a stroke and plays its whole point.
 */

const CONSOLE = readFileSync(
  "src/components/admin/labels/label-console.tsx",
  "utf8",
);
const RAIL = readFileSync(
  "src/components/admin/labels/label-black-rail.tsx",
  "utf8",
);
const DIALOG = readFileSync(
  "src/components/admin/labels/label-shortcuts-dialog.tsx",
  "utf8",
);

const rows = LABEL_SHORTCUT_GROUPS.flatMap((group) => group.items);
const sheetKeys = new Set(rows.map((row) => row.keys.join(" ")));

test.describe("the shortcut sheet", () => {
  test("four groups, every action once", () => {
    expect(LABEL_SHORTCUT_GROUPS.map((g) => g.label)).toEqual([
      "Playback",
      "Move around",
      "Selected shot",
      "Edit",
    ]);
    const actions = rows.map((row) => row.action);
    expect(new Set(actions).size).toBe(actions.length);
  });

  test("every stroke and edit key is on the sheet", () => {
    for (const keys of [
      "F",
      "B",
      "V",
      "O",
      "S",
      "1 2 3 4",
      "C",
      "X",
      "T",
      "A",
      "⇧ A",
      "R",
      "⇧ R",
      "⌫",
    ]) {
      expect(sheetKeys, keys).toContain(keys);
    }
  });

  test("the console's own keys are on it too: the flag walks, ⌘Z, ⌘ enter, esc and the player's D L M", () => {
    for (const keys of [
      "space",
      "←",
      "→",
      "↑",
      "↓",
      "enter",
      "esc",
      "]",
      "[",
      "'",
      ";",
      "⌘ Z",
      "⌘ enter",
      "⌘ /",
      "D",
      "L",
      "M",
    ]) {
      expect(sheetKeys, keys).toContain(keys);
    }
  });

  test("legends follow the Kbd rules: word keys lowercase, letters uppercase, one chip per key", () => {
    for (const row of rows) {
      for (const key of row.keys) {
        if (key.length > 1) expect(key, row.action).toBe(key.toLowerCase());
        else expect(key, row.action).toBe(key.toUpperCase());
        expect(key, row.action).not.toContain("+");
      }
    }
  });

  test("⌘ / or Ctrl / opens it, and so does ? alone; nothing else", () => {
    const key = (k: string, mods: Partial<Record<string, boolean>> = {}) =>
      isShortcutSheetKey({
        key: k,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        ...mods,
      });
    expect(key("/", { metaKey: true })).toBe(true);
    expect(key("/", { ctrlKey: true })).toBe(true);
    expect(key("?")).toBe(true);
    expect(key("/")).toBe(false);
    expect(key("?", { metaKey: true })).toBe(false);
    expect(key("/", { metaKey: true, altKey: true })).toBe(false);
    expect(key("k", { metaKey: true })).toBe(false);
  });

  test("the dialog draws Kbd chips at ConfirmDialog's geometry, and the rail button opens it in full screen", () => {
    expect(DIALOG).toContain("<Kbd key={key}>{key}</Kbd>");
    expect(DIALOG).toContain('width: "560px"');
    // Shorter than the sheet (a 900px laptop), the list scrolls inside the
    // panel: a clipping column, the list the one part that grows and scrolls.
    expect(DIALOG).toContain('maxHeight: "calc(100dvh - 64px)"');
    expect(DIALOG).toMatch(/className="flex flex-col gap-0 overflow-hidden/);
    expect(DIALOG).toMatch(/grid min-h-0 flex-1 [^"]*overflow-y-auto/);
    expect(DIALOG).toContain("Keyboard shortcuts");
    // An icon button: a label, a dark tooltip naming the key.
    expect(RAIL).toContain('aria-label="Keyboard shortcuts"');
    expect(RAIL).toMatch(/label="Keyboard shortcuts"\s+shortcut="⌘\/"/);
    expect(CONSOLE).toContain(
      "onShowShortcuts={fullScreen ? () => setShortcutsOpen(true) : undefined}",
    );
    expect(CONSOLE).toContain("isShortcutSheetKey(event)");
  });
});

test.describe("esc on a selected stroke", () => {
  test("lets go of it and plays the point from its first stroke, following the film", () => {
    expect(CONSOLE).toContain("letGoOfShot.current(selectedShotId);");
    const body = CONSOLE.slice(
      CONSOLE.indexOf("letGoOfShot.current = (shotId) => {"),
    );
    const fn = body.slice(0, body.indexOf("\n    };"));
    for (const step of [
      "cancelReplay();",
      "setPlacement(NO_PLACEMENT);",
      "followPlayback();",
      "seekToPointStart(owner);",
      "player.current?.play();",
    ]) {
      expect(fn, step).toContain(step);
    }
    // The seek comes before the play, so the film starts at the point's top.
    expect(fn.indexOf("seekToPointStart(owner);")).toBeLessThan(
      fn.indexOf("player.current?.play();"),
    );
  });
});

test.describe("esc typed in a cell's field", () => {
  test("cancels the edit and leaves the field, and lets go of nothing else", () => {
    const { escapeLeavesField } = createLoader().load(
      "src/components/admin/labels/label-console.tsx",
    ) as { escapeLeavesField: (target: EventTarget | null) => boolean };
    const from = (selector: string | null) =>
      ({
        closest: (s: string) =>
          selector && s.split(", ").includes(selector) ? {} : null,
      }) as unknown as EventTarget;
    for (const field of [
      "input",
      "textarea",
      "select",
      "[contenteditable='true']",
    ]) {
      expect(escapeLeavesField(from(field)), field).toBe(true);
    }
    // A row, a cell's text or the page: the Esc lets go of the stroke.
    expect(escapeLeavesField(from(null))).toBe(false);
    expect(escapeLeavesField(null)).toBe(false);

    // In the handler: the field is left first (the reverted draft writes
    // nothing on that blur), and only an Esc from outside a field plays the
    // point — so the next Esc, the field left, lets go.
    const handler = CONSOLE.slice(CONSOLE.indexOf("function onEscape("));
    const tail = handler.slice(0, handler.indexOf("\n    }\n"));
    const blur = tail.lastIndexOf("?.blur?.();");
    const guard = tail.indexOf("if (escapeLeavesField(event.target)) return;");
    const letGo = tail.indexOf("letGoOfShot.current(selectedShotId);");
    expect(guard).toBeGreaterThan(-1);
    expect(blur).toBeLessThan(guard);
    expect(guard).toBeLessThan(letGo);
  });
});
