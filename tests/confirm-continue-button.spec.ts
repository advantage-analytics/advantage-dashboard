import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The Continue button on `/confirm` disables itself while the sign-in POST is
 * in flight. Without that, a double-tap sends two POSTs: the first spends the
 * token and signs the person in, the second finds it spent and lands them on
 * "That link has expired" — the exact screen the page exists to prevent.
 */
function render(pending: boolean): string {
  const loader = createLoader({
    stubs: {
      "react-dom": { useFormStatus: () => ({ pending }) },
    },
  });
  const { ContinueButton } = loader.load(
    "src/app/(auth)/confirm/continue-button.tsx",
  ) as { ContinueButton: React.ComponentType };
  return renderToStaticMarkup(React.createElement(ContinueButton));
}

test("at rest it is an enabled submit reading Continue", () => {
  const markup = render(false);
  expect(markup).toMatch(/<button[^>]*type="submit"/);
  // The attribute, not the word: the button's classes carry `disabled:` variants.
  expect(markup).not.toMatch(/<button[^>]*\sdisabled=""/);
  expect(markup).toContain(">Continue</button>");
});

test("while the form is submitting it is disabled and says so", () => {
  const markup = render(true);
  expect(markup).toMatch(/<button[^>]*disabled=""/);
  expect(markup).toContain(">Signing in...</button>");
});
