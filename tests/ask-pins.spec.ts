import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader, marker } from "./fixtures/vm-modules";
import type { AskPin } from "@/lib/data/ask-server";

/**
 * "Pinned from Ask" on Home (`ask-pin-card.tsx`), rendered offline from the
 * real file through `createLoader()`: the card's name, one block per pin
 * drawn by the answer's own `AskVisualBlock`, the caption rule, the links,
 * and the separator between pins. The server action and `next/link` are
 * stubbed; the visual block is a marker, since its drawing is
 * `tests/ask-visuals.spec.ts`'s business.
 *
 * The loader side — `getAskPins()`, `ask_pin_answer()` — is a database read
 * and the migration's VERIFIED block; the rules it follows are pinned here
 * through the card's inputs.
 */

function LinkStub({
  href,
  children,
  ...rest
}: {
  href: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return React.createElement("a", { href, ...rest }, children);
}

const loader = createLoader({
  stubs: {
    "next/link": { __esModule: true, default: LinkStub },
    "@/app/dashboard/ask/actions": {
      unpinAskAnswer: async () => ({ ok: true }),
    },
    "@/components/dashboard/ask/visuals/ask-visual": {
      AskVisualBlock: (props: { visual: { kind: string } }) =>
        React.createElement("span", {
          "data-component": "AskVisualBlock",
          "data-kind": props.visual.kind,
        }),
    },
    "@/components/dashboard/loading/pending": {
      PendingBar: marker("PendingBar"),
    },
  },
});

const { AskPinCard } = loader.load(
  "src/components/dashboard/home/ask-pin-card.tsx",
) as { AskPinCard: React.ComponentType<{ pins: AskPin[] }> };

const serve: AskPin["visual"] = {
  kind: "serve",
  caption: "Where your first serves went.",
  courts: [
    {
      label: "Deuce",
      t: { value: 9, text: "9" },
      body: { value: 3, text: "3" },
      wide: { value: 6, text: "6" },
    },
  ],
};

const PIN: AskPin = {
  id: "pin-1",
  caption: "Where your first serves went.",
  visual: serve,
  createdAt: "2026-10-10T00:00:00.000Z",
  conversationId: "cccccccc-0000-4000-8000-000000000001",
};

function render(pins: AskPin[]): string {
  return renderToStaticMarkup(React.createElement(AskPinCard, { pins }));
}

test("one pin: the card, the block, the answer link and Unpin", () => {
  const html = render([PIN]);
  expect(html).toContain('aria-label="Pinned from Ask"');
  expect(html).toContain("Pinned from Ask");
  expect(html).toContain('data-component="AskVisualBlock"');
  expect(html).toContain('data-kind="serve"');
  expect(html).toContain(
    'href="/dashboard/ask?c=cccccccc-0000-4000-8000-000000000001"',
  );
  expect(html).toContain("Open the answer");
  expect(html).toContain("Unpin");
  expect(html).toContain('href="/dashboard/ask"');
  // The block prints its own caption; the pin's is the same line, so once.
  expect(html.split("Where your first serves went.").length - 1).toBe(0);
});

test("a caption that differs from the block's is printed once, under it", () => {
  const html = render([{ ...PIN, caption: "Your first serves this season" }]);
  expect(html).toContain("Your first serves this season");
});

test("a pin whose conversation was deleted keeps the block and loses the link", () => {
  const html = render([{ ...PIN, conversationId: null }]);
  expect(html).toContain('data-component="AskVisualBlock"');
  expect(html).not.toContain("Open the answer");
  expect(html).toContain("Unpin");
});

test("two pins sit on a hairline, newest first as given", () => {
  const html = render([PIN, { ...PIN, id: "pin-2", conversationId: null }]);
  expect(html.match(/data-ask-pin="/g)).toHaveLength(2);
  expect(html.indexOf('data-ask-pin="pin-1"')).toBeLessThan(
    html.indexOf('data-ask-pin="pin-2"'),
  );
  expect(
    html.match(/border-t border-\[var\(--border-hairline\)\]/g),
  ).toHaveLength(1);
});
