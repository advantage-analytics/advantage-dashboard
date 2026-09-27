import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The upload wizard's route skeleton — `team/upload/loading.tsx` (pinned) and
 * `matches/new/loading.tsx` (not). Offline: rendered to static markup and read
 * as text — what is asserted is the Carbon/DS contract, not pixels.
 *
 *   - one `role="status"`, labelled "Loading upload wizard"
 *   - the step it opens on: the indicator's index and count, and that step's
 *     title and lede as real text, from `STEP_CONFIG` via `stepHeading`
 *   - the pinned strip only on the pinned variant
 *   - every skeleton-token element is hidden and pulses motion-safe
 *   - nothing interactive, no hex colour
 */

type Heading = { title: string; description: string };

const loader = createLoader();
const { UploadWizardPending } = loader.load(
  "src/components/dashboard/loading/upload-wizard-pending.tsx",
) as {
  UploadWizardPending: React.ComponentType<{ pinned: boolean }>;
};
const { STEP_CONFIG, STEP_CONFIG_PROCESSING, STEP_ORDER_BY_KIND } = loader.load(
  "src/components/dashboard/matches/new-match-wizard/types.ts",
) as {
  STEP_CONFIG: Record<string, Heading>;
  STEP_CONFIG_PROCESSING: Record<string, Partial<Heading>>;
  STEP_ORDER_BY_KIND: Record<string, string[]>;
};

function render(pinned: boolean) {
  return renderToStaticMarkup(
    React.createElement(UploadWizardPending, { pinned }),
  );
}

/** Text as React escapes it into markup. */
function escaped(text: string) {
  return text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;");
}

const VARIANTS = [
  { name: "pinned", pinned: true, step: "file" },
  { name: "unpinned", pinned: false, step: "provider" },
] as const;

const PINNED_STRIP =
  "h-9 shrink-0 items-center gap-2 border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)]";

for (const { name, pinned, step } of VARIANTS) {
  const html = render(pinned);
  const order = STEP_ORDER_BY_KIND.processing;
  const index = order.indexOf(step);
  const heading = { ...STEP_CONFIG[step], ...STEP_CONFIG_PROCESSING[step] };

  test.describe(name, () => {
    test("one loading status, labelled for the wizard", () => {
      expect(html.match(/role="status"/g)?.length).toBe(1);
      expect(html).toContain(
        'role="status" aria-label="Loading upload wizard"',
      );
    });

    test(`opens on the ${step} step: indicator, eyebrow, title and lede`, () => {
      expect(html).toContain(`aria-valuenow="${index + 1}"`);
      expect(html).toContain(`aria-valuemax="${order.length}"`);
      // React may or may not split the text node with `<!-- -->` markers.
      expect(html.replace(/<!-- -->/g, "")).toContain(
        `>Step ${index + 1} of ${order.length}</span>`,
      );
      expect(html).toMatch(
        new RegExp(
          `<h1[^>]*>${escaped(heading.title).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</h1>`,
        ),
      );
      expect(html).toContain(escaped(heading.description));
    });

    test("the pinned strip is drawn only when pinned", () => {
      expect(html.includes(PINNED_STRIP)).toBe(pinned);
    });

    test("WizardShell's column and 64px hairline footer", () => {
      expect(html).toContain("mx-auto w-full max-w-[832px] px-14 pt-16 pb-24");
      expect(html).toContain(
        "sticky bottom-0 z-10 mt-auto border-t border-[var(--border-hairline)]",
      );
      expect(html).toContain("flex h-16 items-center gap-4");
    });

    test("nothing is interactive and no colour is a hex", () => {
      expect(html).not.toContain("<button");
      expect(html).not.toContain("<a ");
      expect(html).not.toContain("<input");
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    });

    test("every skeleton element is hidden and pulses motion-safe", () => {
      const VOID = new Set(["br", "hr", "img", "input", "meta", "link"]);
      const stack: boolean[] = [];
      let skeletons = 0;
      for (const match of html.matchAll(
        /<(\/?)([a-zA-Z0-9]+)([^>]*?)(\/?)>/g,
      )) {
        const [, closing, tag, attrs, selfClosing] = match;
        if (closing) {
          stack.pop();
          continue;
        }
        const hidden = /aria-hidden="true"/.test(attrs);
        const underHidden = stack.includes(true);
        if (attrs.includes("data-pending-bar")) {
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

test("the two variants open on different steps", () => {
  expect(render(true)).toContain(escaped(STEP_CONFIG_PROCESSING.file.title!));
  expect(render(false)).toContain(escaped(STEP_CONFIG.provider.title));
});
