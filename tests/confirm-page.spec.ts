import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Redirect, redirectStub } from "./fixtures/next-redirect-stub";
import { createLoader } from "./fixtures/vm-modules";

/**
 * `/confirm` — where every auth email link lands.
 *
 * The page must do nothing on GET. Mail scanners, Safe Links, link previews
 * and a mail client's own prefetch all open emailed links before the person
 * does, and a one-time token spent by any of them is a sign-in the person
 * never gets (2026-10-07: a coach's three magic links in a row). So the GET
 * renders a button and the token rides along as hidden fields; only the
 * POST signs anyone in. This spec pins the GET half: no Supabase client is
 * built, and the form carries everything the action needs.
 */

function load() {
  const loader = createLoader({
    globals: { URL, URLSearchParams },
    stubs: {
      "@/lib/supabase/server": {
        createClient: () => {
          throw new Error("createClient must not run on a GET of /confirm");
        },
      },
      "next/navigation": redirectStub,
      "./actions": { confirmLinkForm: async () => {} },
    },
  });
  return loader.load("src/app/(auth)/confirm/page.tsx") as {
    default: (props: {
      searchParams: Promise<Record<string, string | undefined>>;
    }) => Promise<React.ReactElement>;
  };
}

async function render(params: Record<string, string | undefined>) {
  const { default: Page } = load();
  return renderToStaticMarkup(
    await Page({ searchParams: Promise.resolve(params) }),
  );
}

function hidden(markup: string, name: string): string | null {
  const match = markup.match(
    new RegExp(`<input[^>]*name="${name}"[^>]*value="([^"]*)"`),
  );
  return match ? match[1] : null;
}

test("a token_hash link renders a button, not a sign-in", async () => {
  const markup = await render({
    token_hash: "abc123",
    type: "magiclink",
    next: "/claim/verify",
  });
  expect(markup).toContain("<form");
  expect(markup).toMatch(/<button[^>]*type="submit"[^>]*>Continue<\/button>/);
  expect(hidden(markup, "token_hash")).toBe("abc123");
  expect(hidden(markup, "type")).toBe("magiclink");
  expect(hidden(markup, "next")).toBe("/claim/verify");
});

test("a code link carries the code instead", async () => {
  const markup = await render({ code: "xyz", next: "/dashboard" });
  expect(hidden(markup, "code")).toBe("xyz");
  expect(hidden(markup, "next")).toBe("/dashboard");
  expect(markup).not.toContain('name="token_hash"');
});

test("a link with no token goes to the error page", async () => {
  await expect(render({ next: "/dashboard" })).rejects.toMatchObject({
    to: "/error?error=That%20link%20is%20missing%20its%20token.",
  });
});
