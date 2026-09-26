import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { MatchFilmEntry } from "@/lib/match-video/film-entry";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The Video view's two expiry surfaces (SwingVision Add video T10):
 *
 *   FilmExpiryNotice   the amber notice in the last 30 days, with "Keep this
 *                      video", which POSTs T8's `/video/viewed` and hides
 *   FilmExpiredState   "This video was removed", on the empty state's anatomy
 *
 * Rendered offline through `fixtures/vm-modules`. The notice's press is
 * driven without a DOM: its module is loaded against a tiny `react` whose
 * `useState` keeps slots between calls, the component function is called
 * directly, the button's own `onClick` is invoked, and the function is
 * called again to see what it renders now. The request itself goes through
 * the REAL `keepMatchVideo` with a recording `fetch`.
 */

const MATCH_ID = "11111111-1111-4111-8111-111111111111";
const EXPIRES_AT = "2026-10-23T12:00:00.000Z";
const NOTICE =
  "src/components/dashboard/matches/match-detail/film/film-expiry-notice.tsx";
const EXPIRED =
  "src/components/dashboard/matches/match-detail/film/film-expired-state.tsx";
const RECORD_VIEW =
  "@/components/dashboard/matches/match-detail/film/record-video-view";

/** Rendered text with tags stripped and entities decoded. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) =>
    m[1].replace(/&amp;/g, "&"),
  );
}

const linkStub = ({
  href,
  children,
  ...rest
}: React.PropsWithChildren<{ href: string }>) =>
  React.createElement("a", { href, ...rest }, children);

/* -------------------------------------------------------------------------
 * The notice
 * ---------------------------------------------------------------------- */

type NoticeProps = {
  matchId: string;
  monthsUnwatched: number;
  expiresAt: string;
};

test("the notice says how long, when, and that the statistics stay", () => {
  const { FilmExpiryNotice } = createLoader().load(NOTICE) as {
    FilmExpiryNotice: React.ComponentType<NoticeProps>;
  };
  const html = renderToStaticMarkup(
    React.createElement(FilmExpiryNotice, {
      matchId: MATCH_ID,
      monthsUnwatched: 11,
      expiresAt: EXPIRES_AT,
    }),
  );
  expect(text(html)).toBe(
    "Not watched in 11 months, so this video will be removed on Oct 23. The statistics stay. Keep this video",
  );
  // The warning register, announced; the answer is a real button.
  expect(html).toContain('role="status"');
  expect(html).toContain("var(--warning-bg)");
  expect(html).toMatch(/<button type="button"[^>]*>Keep this video<\/button>/);
});

test("one month is singular", () => {
  const { expiryNoticeCopy } = createLoader().load(
    "src/lib/match-video/film-entry.ts",
  ) as { expiryNoticeCopy: (n: number, iso: string) => string };
  expect(expiryNoticeCopy(1, EXPIRES_AT)).toBe(
    "Not watched in 1 month, so this video will be removed on Oct 23. The statistics stay.",
  );
});

/** A `react` whose `useState` persists across direct calls of one component. */
function hookHarness() {
  const slots: unknown[] = [];
  let cursor = 0;
  const fakeReact = {
    ...React,
    useState<T>(initial: T) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      const set = (next: T | ((prev: T) => T)) => {
        slots[index] =
          typeof next === "function"
            ? (next as (prev: T) => T)(slots[index] as T)
            : next;
      };
      return [slots[index] as T, set] as const;
    },
  };
  return {
    fakeReact,
    render<P>(component: (props: P) => React.ReactNode, props: P) {
      cursor = 0;
      return component(props);
    },
  };
}

/** The first element in a tree whose type is `button`. */
function findButton(node: React.ReactNode): React.ReactElement<{
  onClick: () => Promise<void>;
  children: React.ReactNode;
}> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findButton(child);
      if (found) return found;
    }
    return null;
  }
  const element = node as React.ReactElement<{ children?: React.ReactNode }>;
  if (element.type === "button") return element as never;
  return findButton(element.props?.children);
}

function pressKeep(response: { ok: boolean } | "network") {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    requests.push({ url, init });
    if (response === "network") throw new TypeError("Failed to fetch");
    return response as Response;
  }) as unknown as typeof fetch;

  // The real helper, handed the recording fetch.
  const { keepMatchVideo } = createLoader().load(
    "src/components/dashboard/matches/match-detail/film/record-video-view.ts",
  ) as {
    keepMatchVideo: (id: string, f?: typeof fetch) => Promise<boolean>;
  };
  const hooks = hookHarness();
  const { FilmExpiryNotice } = createLoader({
    stubs: {
      react: hooks.fakeReact,
      [RECORD_VIEW]: {
        keepMatchVideo: (id: string) => keepMatchVideo(id, fakeFetch),
      },
    },
  }).load(NOTICE) as {
    FilmExpiryNotice: (props: NoticeProps) => React.ReactNode;
  };
  const props = {
    matchId: MATCH_ID,
    monthsUnwatched: 11,
    expiresAt: EXPIRES_AT,
  };
  return {
    requests,
    render: () => hooks.render(FilmExpiryNotice, props),
  };
}

test('"Keep this video" POSTs the view and hides the notice', async () => {
  const notice = pressKeep({ ok: true });
  const before = notice.render();
  expect(before).not.toBeNull();
  const button = findButton(before);
  expect(button?.props.children).toBe("Keep this video");

  await button!.props.onClick();

  expect(notice.requests).toEqual([
    {
      url: `/api/matches/${MATCH_ID}/video/viewed`,
      init: { method: "POST", credentials: "same-origin" },
    },
  ]);
  // Hidden once the clock has actually restarted.
  expect(notice.render()).toBeNull();
});

test("a keep that fails leaves the notice up and offers another try", async () => {
  for (const response of [{ ok: false }, "network"] as const) {
    const notice = pressKeep(response);
    await findButton(notice.render())!.props.onClick();
    expect(notice.requests).toHaveLength(1);

    const after = notice.render();
    expect(after).not.toBeNull();
    expect(findButton(after)?.props.children).toBe("Try again");
    expect(text(renderToStaticMarkup(after as React.ReactElement))).toContain(
      "That didn't go through.",
    );
  }
});

/* -------------------------------------------------------------------------
 * The expired state
 * ---------------------------------------------------------------------- */

function renderExpired(entry: Partial<MatchFilmEntry>): string {
  const loader = createLoader({
    stubs: {
      "@/components/dashboard/matches/match-data-provider": {
        useMatchData: () => ({
          match: { id: MATCH_ID, sourceProvider: "swing-vision" },
        }),
      },
      "next/link": linkStub,
    },
  });
  const { FilmExpiredState } = loader.load(EXPIRED) as {
    FilmExpiredState: React.ComponentType<{ entry: MatchFilmEntry }>;
  };
  const full: MatchFilmEntry = {
    attachment: "absent",
    actions: ["add"],
    problem: null,
    quota: { used: 18, cap: 25, holder: null },
    expiredAt: EXPIRES_AT,
    ...entry,
  };
  return renderToStaticMarkup(
    React.createElement(FilmExpiredState, { entry: full }),
  );
}

const EXPIRED_BODY =
  "Nobody watched it for a year, so it was removed on Oct 23, 2026. The statistics and the point list are unchanged. Add the film again to get the clips back.";

test("the expired state: heading, body, Add video and the count", () => {
  const html = renderExpired({});
  // The empty state's anatomy: icon, rule, heading.
  expect(html).toContain("<svg");
  expect(html).toMatch(/<h2[^>]*>This video was removed<\/h2>/);
  const t = text(html);
  expect(t).toContain(EXPIRED_BODY);
  expect(t).toContain("Add video");
  expect(t).toContain("MP4 up to 8 GB · 18 of 25 match videos used");
  expect(hrefs(html)).toEqual([
    `/dashboard/matches/new?videoFor=${MATCH_ID}&mode=add`,
  ]);
});

test("without the add action: the sentence, and no button or micro line", () => {
  const html = renderExpired({ actions: [], quota: null });
  const t = text(html);
  expect(html).toMatch(/<h2[^>]*>This video was removed<\/h2>/);
  expect(t).toContain(EXPIRED_BODY);
  expect(t).not.toContain("Add video");
  expect(t).not.toContain("MP4 up to");
  expect(hrefs(html)).toEqual([]);
});

test("at the cap it points where the video is, never at a refused add", () => {
  const html = renderExpired({ quota: { used: 25, cap: 25, holder: null } });
  const t = text(html);
  expect(t).toContain(EXPIRED_BODY);
  expect(t).not.toContain("Add video");
  expect(t).toContain("Manage match videos");
  expect(t).toContain("25 of 25 match videos used");
  expect(hrefs(html)).toEqual(["/dashboard/settings/usage"]);
});
