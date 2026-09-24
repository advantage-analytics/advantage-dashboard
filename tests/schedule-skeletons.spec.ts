import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The team schedule's two route skeletons — `schedule/[eventId]/loading.tsx`
 * (`EventTableSkeleton`) and `schedule/single/[matchId]/loading.tsx`
 * (`SingleMatchPending`). Offline: rendered to static markup and read as text
 * — what is asserted is the Carbon/DS contract and the real pages' geometry,
 * not pixels.
 *
 *   - one `role="status"` each, labelled for what is loading
 *   - every skeleton bar is hidden and pulses motion-safe
 *   - nothing interactive, no hex colour
 *   - the event table card: a hairline header row of six bars, one group
 *     head, nine 48px rows, and no border on any row but the header's
 *   - the single match: one column, no 300px rail
 */

const loader = createLoader();
const { EventTableSkeleton, SingleMatchPending } = loader.load(
  "src/components/dashboard/loading/page-skeletons.tsx",
) as {
  EventTableSkeleton: React.ComponentType;
  SingleMatchPending: React.ComponentType;
};

const source = (path: string) => readFileSync(resolve(path), "utf8");

const VOID = new Set(["br", "hr", "img", "input", "meta", "link"]);
const TAG = /<(\/?)([a-zA-Z0-9]+)([^>]*?)(\/?)>/g;

function classesOf(attrs: string): string[] {
  return (attrs.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/);
}

/** The markup of the first element whose class list holds `token`, inclusive. */
function elementWithClass(html: string, token: string): string {
  let depth = 0;
  let start = -1;
  for (const match of html.matchAll(TAG)) {
    const [whole, closing, tag, attrs, selfClosing] = match;
    const isVoid = Boolean(selfClosing) || VOID.has(tag);
    if (start < 0) {
      if (!closing && classesOf(attrs).includes(token)) {
        if (isVoid) return whole;
        start = match.index!;
        depth = 1;
      }
      continue;
    }
    if (closing) depth--;
    else if (!isVoid) depth++;
    if (depth === 0) return html.slice(start, match.index! + whole.length);
  }
  throw new Error(`no element with class ${token}`);
}

/** Every opening tag's class list, in document order. */
function classLists(html: string): string[][] {
  return [...html.matchAll(TAG)]
    .filter(([, closing]) => !closing)
    .map(([, , , attrs]) => classesOf(attrs));
}

const SKELETONS = [
  {
    name: "EventTableSkeleton",
    component: EventTableSkeleton,
    label: "Loading event",
  },
  {
    name: "SingleMatchPending",
    component: SingleMatchPending,
    label: "Loading match",
  },
] as const;

for (const { name, component, label } of SKELETONS) {
  const html = renderToStaticMarkup(React.createElement(component));

  test.describe(name, () => {
    test("one loading status, labelled for the page", () => {
      expect(html.match(/role="status"/g)?.length).toBe(1);
      expect(html).toContain(`role="status" aria-label="${label}"`);
    });

    test("nothing is interactive and no colour is a hex", () => {
      expect(html).not.toContain("<button");
      expect(html).not.toContain("<a ");
      expect(html).not.toContain("<input");
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    });

    test("every skeleton element is hidden and pulses motion-safe", () => {
      // Walk the markup as a tag stack, so "under an aria-hidden ancestor" is
      // checked structurally rather than by position in the string.
      const stack: boolean[] = [];
      let skeletons = 0;
      for (const match of html.matchAll(TAG)) {
        const [, closing, tag, attrs, selfClosing] = match;
        if (closing) {
          stack.pop();
          continue;
        }
        const hidden = /aria-hidden="true"/.test(attrs);
        const underHidden = stack.includes(true);
        if (/\sdata-pending-bar=""/.test(attrs)) {
          skeletons++;
          expect(underHidden, attrs).toBe(true);
          expect(attrs).toContain("motion-safe:animate-pulse");
        }
        if (!selfClosing && !VOID.has(tag)) stack.push(hidden);
      }
      expect(skeletons).toBeGreaterThan(8);
      expect(html).not.toMatch(/(?<!motion-safe:)\banimate-pulse\b/);
    });
  });
}

test.describe("EventTableSkeleton mirrors EventTable", () => {
  const html = renderToStaticMarkup(React.createElement(EventTableSkeleton));
  const card = elementWithClass(html, "surface-card");
  const table = source("src/components/dashboard/schedule/event-table.tsx");
  const dual = source("src/components/dashboard/schedule/dual-detail.tsx");

  test("the card, header row and page spacing are EventTable's own", () => {
    for (const cls of [
      "surface-card min-w-0 px-6 pt-0.5 pb-2.5",
      "grid items-center gap-x-4 border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
      "flex min-w-0 flex-1 flex-col gap-8 px-14 pt-6 pb-7",
    ]) {
      expect(table, cls).toContain(cls);
    }
    expect(card).toContain('class="surface-card min-w-0 px-6 pt-0.5 pb-2.5"');
    expect(card).toContain(
      "grid items-center gap-x-4 border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
    );
    expect(html).toContain("flex flex-col gap-8 px-14 pt-6 pb-7");
  });

  test("exactly one element in the card carries border-b: the header row", () => {
    const bordered = classLists(card).filter((list) =>
      list.includes("border-b"),
    );
    expect(bordered).toHaveLength(1);
    expect(bordered[0]).toContain("pt-3.5");
    expect(card).not.toContain("not-last:border-b");
  });

  test("six header bars on the dual's six-track grid, one group head, nine 48px rows", () => {
    const grid = dual.match(/const GRID =\s*"([^"]+)"/)?.[1];
    expect(grid).toBeTruthy();
    const header = elementWithClass(card, "border-b");
    expect(header).toContain(grid!);
    expect(header.match(/\sdata-pending-bar=""/g)?.length).toBe(6);

    const rows = classLists(card).filter((list) => list.includes("h-12"));
    expect(rows).toHaveLength(9);
    for (const row of rows) expect(row).toContain(grid!);

    // The group head sits between the header and the first row: EventGroupHead's padding.
    expect(table).toContain('"flex items-baseline gap-2.5 pb-1"');
    expect(
      classLists(card).filter(
        (list) => list.includes("pt-3") && list.includes("pb-1"),
      ),
    ).toHaveLength(1);
  });

  test("the strip draws the dual's three cells", () => {
    const cells = classLists(html).filter((list) =>
      list.includes("not-first:border-l"),
    );
    expect(cells).toHaveLength(3);
  });
});

test.describe("SingleMatchPending mirrors SingleDetail", () => {
  const html = renderToStaticMarkup(React.createElement(SingleMatchPending));
  const detail = source("src/components/dashboard/schedule/single-detail.tsx");

  test("EventShell's padded column, the title row and the status row", () => {
    expect(
      source("src/components/dashboard/schedule/event-shell.tsx"),
    ).toContain("px-12 pt-[26px] pb-8");
    expect(html).toContain("px-12 pt-[26px] pb-8");
    expect(detail).toContain('"flex items-end gap-12"');
    expect(html).toContain('class="flex items-end gap-12"');
    // The 30px title and the 40px score.
    expect(html).toContain("h-[30px]");
    expect(html).toContain("h-10 w-32 shrink-0");
    const statusRow =
      "mt-[26px] flex items-center gap-2 border-t border-[var(--border-hairline)] pt-3.5";
    expect(detail).toContain(statusRow);
    expect(html).toContain(statusRow);
    expect(detail).toContain('"mt-7 max-w-[560px]"');
    expect(html).toContain('class="mt-7 max-w-[560px]"');
  });

  test("no rail and no list", () => {
    const railed = classLists(html).filter((list) =>
      list.some((cls) => cls.includes("grid-cols") && cls.includes("300px")),
    );
    expect(railed).toEqual([]);
    expect(html).not.toContain("h-[52px]");
  });

  test("From the report is conditional, so it is not promised", () => {
    expect(detail).toMatch(/\{match\.summary \? \(/);
    expect(html).not.toContain("max-w-[640px]");
  });
});

test("the single match route's loading.tsx exports SingleMatchPending", () => {
  expect(
    source("src/app/dashboard/team/schedule/single/[matchId]/loading.tsx"),
  ).toContain("SingleMatchPending as default");
});
