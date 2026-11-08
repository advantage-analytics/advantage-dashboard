import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { shortcutGroupsFor } from "@/components/admin/labels/label-shortcuts";

/** The guide is the labeller's: their sheet, without the admin-only keys. */
const LABEL_SHORTCUT_GROUPS = shortcutGroupsFor("labeller");
import {
  CLEANING_STANDARD_SECTIONS,
  GUIDE_VERSION,
  HOW_TO_SECTIONS,
} from "@/lib/labels/guide-content";
import { createLoader } from "./fixtures/vm-modules";

/**
 * `/label/guide` (T9): the guide's content component rendered offline, and
 * the page module's imports read from source. No database, no server.
 */

const ROOT = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

/** Markup text with the entities React escapes put back. */
function decode(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Through the vm loader: Playwright's own transform turns the JSX of an
// imported `.tsx` into its component-testing shape, which React rejects.
const { LabelGuide } = createLoader().load(
  "src/components/label/label-guide.tsx",
) as { LabelGuide: React.ComponentType };

const markup = decode(renderToStaticMarkup(React.createElement(LabelGuide)));

const HOW_TO_HEADINGS = [
  "Video controls",
  "The rail",
  "Keys",
  "Combine and split points",
  "Game boundaries",
  "Players at the wrong end",
  "Set the server",
  "Undo and redo",
  "Submit for review",
];

const STANDARD = [
  "Structure and amber flags first, then grey, then forced/unforced error marks.",
  "Watch the whole match: a clean flag count does not mean a correct match — a hitter swap raises no flag.",
  "Never delete a rally. If you are unsure, it is a point.",
  "Do not adjust shot coordinates.",
  "Leave anything you cannot resolve flagged.",
  "Done means: no amber stops, and the score matches.",
];

/** The markup of one `<section id>`. */
function part(id: string): string {
  const match = markup.match(
    new RegExp(`<section id="${id}"[^>]*>([\\s\\S]*?)</section>`),
  );
  expect(match, `section #${id}`).not.toBeNull();
  return match![1];
}

const h3s = (html: string) =>
  [...html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1]);

test.describe("LabelGuide", () => {
  test("prints the version", () => {
    expect(GUIDE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(markup).toContain(`Guide v${GUIDE_VERSION}`);
  });

  test("How-to has the nine headings, in order", () => {
    expect(HOW_TO_SECTIONS.map((s) => s.heading)).toEqual(HOW_TO_HEADINGS);
    expect(h3s(part("how-to"))).toEqual(HOW_TO_HEADINGS);
  });

  test("the cleaning standard lists the six rules verbatim", () => {
    const html = part("cleaning-standard");
    const items = [...html.matchAll(/<li[^>]*>([^<]*)<\/li>/g)].map(
      (m) => m[1],
    );
    for (const sentence of STANDARD) expect(items).toContain(sentence);
    expect(CLEANING_STANDARD_SECTIONS.length).toBeGreaterThan(0);
  });

  test("an in-page nav links the two sections", () => {
    expect(markup).toContain('href="#how-to"');
    expect(markup).toContain('href="#cleaning-standard"');
  });

  test("Keys is generated from LABEL_SHORTCUT_GROUPS", () => {
    const keys = part("how-to").match(
      /<div id="keys"[\s\S]*?(?=<div id="combine-and-split")/,
    )![0];
    const rendered = [...keys.matchAll(/data-guide-keys="([^"]*)"/g)].map(
      (m) => m[1],
    );
    const expected = LABEL_SHORTCUT_GROUPS.flatMap((group) =>
      group.items.map((item) => item.keys.join("")),
    );
    expect(rendered).toEqual(expected);
    for (const key of ["]", "[", "'", ";", "⌘Z", "⌘⇧Z"]) {
      expect(rendered).toContain(key);
    }
    // The shot kinds are an admin's keys: never in a labeller's guide.
    // (L stays: it is a labeller's let as well as an admin's lob.)
    for (const key of ["G", "D", "P"]) {
      expect(rendered).not.toContain(key);
    }
    for (const group of LABEL_SHORTCUT_GROUPS) {
      expect(keys).toContain(`data-guide-shortcut-group="${group.label}"`);
    }
  });

  test("every key the prose names in brackets is that action's shortcut", () => {
    // The prose is hand-written and the Keys table is generated, so a rebind
    // ("Loop (L)" after Loop moved to ⇧L and L became a let) would otherwise
    // leave the guide telling a vendor to press the wrong key.
    const prose = HOW_TO_SECTIONS.flatMap((section) =>
      section.blocks.flatMap((block) =>
        block.kind === "paragraph"
          ? [block.text]
          : block.kind === "list"
            ? [...block.items]
            : [],
      ),
    );
    const shortcuts = LABEL_SHORTCUT_GROUPS.flatMap((group) => group.items);
    const named = prose.flatMap((text) =>
      [...text.matchAll(/(\p{L}[\p{L} ]*?) \(([⇧⌘]*\p{Lu})\)/gu)].map((m) => ({
        name: m[1].split(" ").at(-1)!,
        key: m[2],
        text,
      })),
    );
    expect(named.map((n) => n.key)).toEqual(
      expect.arrayContaining(["⇧L", "⇧D", "M"]),
    );
    for (const { key, text } of named) {
      const shortcut = shortcuts.find((item) => item.keys.join("") === key);
      expect(shortcut, `"${text}" names ${key}`).toBeDefined();
    }
    const loop = shortcuts.find((item) => /^Loop/.test(item.action))!;
    expect(prose.join(" ")).toContain(`Loop (${loop.keys.join("")})`);
  });

  test("links nowhere under /admin", () => {
    expect(markup).not.toMatch(/href="[^"]*\/admin/);
    expect(markup).not.toContain("/admin");
  });
});

test.describe("/label/guide page module", () => {
  test("imports nothing from admin-guard beyond the layout's own gate", () => {
    const page = read("src/app/label/guide/page.tsx");
    const imports = [
      ...page.matchAll(
        /import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/services\/programs\/admin-guard["']/g,
      ),
    ].flatMap((m) =>
      m[1]
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    );
    expect(
      imports.every((name) => name === "requireLabelViewerOrNotFound"),
    ).toBe(true);
    // No default or namespace import that could reach the rest.
    expect(page).not.toMatch(
      /import\s+(\*\s+as\s+\w+|\w+)\s+from\s*["'][^"']*admin-guard["']/,
    );
    // The layout supplies the same gate the page re-runs.
    expect(read("src/app/label/layout.tsx")).toContain(
      "requireLabelViewerOrNotFound",
    );
  });

  test("the content and its words import no admin-guard at all", () => {
    for (const file of [
      "src/components/label/label-guide.tsx",
      "src/lib/labels/guide-content.ts",
    ]) {
      expect(read(file)).not.toContain("admin-guard");
    }
  });
});
