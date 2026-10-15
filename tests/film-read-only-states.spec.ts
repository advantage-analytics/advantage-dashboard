import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { MatchFilmEntry } from "@/lib/match-video/film-entry";
import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * The Video view's no-video states under a read-only report (T6).
 *
 * `FilmTab` reads `meta.readOnly` off `useOptionalMatchReport()` and hands it
 * to whichever state `filmEntryView` picks. Each keeps its sentence and drops
 * its offer: the unavailable state's Replace/Align row, the empty and expired
 * states' Add video. The room's own write paths are the browser spec's
 * (`film-playback-refresh.spec.ts`); this pins the three branches that spec
 * cannot reach, since it always mounts the tab WITH a video.
 *
 * Rendered offline through `fixtures/vm-modules`: the real `FilmTab` with
 * the room's modules stubbed (they never render here — `video` is null) and
 * the report context answering a chosen `readOnly`. The entry grants every
 * action, so an absent control is the read-only gate and nothing else.
 */

const FILM_TAB =
  "src/components/dashboard/matches/match-detail/film/film-tab.tsx";
const MATCH_ID = "11111111-1111-4111-8111-111111111111";

/** Everything the server could let the viewer do. */
const ALL_ACTIONS: MatchFilmEntry["actions"] = ["add", "replace", "align"];

const linkStub = ({
  href,
  children,
  ...rest
}: React.PropsWithChildren<{ href: string }>) =>
  React.createElement("a", { href, ...rest }, children);

function render(
  entry: MatchFilmEntry,
  opts: { readOnly: boolean; sourceProvider?: string | null },
): string {
  const report = {
    state: {},
    actions: { selectView: () => {} },
    meta: { readOnly: opts.readOnly, playbackEndpoint: null },
  };
  const loader = createLoader({
    markUnknown: true,
    stubs: {
      "next/dynamic": () => marker("dynamic"),
      "next/navigation": {
        useSearchParams: () => new URLSearchParams(),
        useRouter: () => ({ refresh: () => {} }),
        usePathname: () => "/",
      },
      "next/link": linkStub,
      "@/lib/supabase/client": { createClient: () => ({}) },
      "@/components/dashboard/matches/match-data-provider": {
        useMatchData: () => ({
          match: {
            id: MATCH_ID,
            sourceProvider: opts.sourceProvider ?? null,
          },
          points: [],
          pointsRef: { current: [] },
          setPoints: () => {},
        }),
      },
      "@/components/dashboard/matches/match-detail/match-report-context": {
        useOptionalMatchReport: () => report,
        useMatchReport: () => report,
      },
      // The room and its hooks: never reached with `video` null, so a marker
      // for each is enough to let the module load.
      "@/components/dashboard/matches/match-detail/film/film-player": {
        FilmPlayer: marker("FilmPlayer"),
      },
      "@/components/dashboard/matches/match-detail/film/point-list": {
        PointList: marker("PointList"),
      },
      "@/components/dashboard/matches/match-detail/film/film-this-point": {
        FilmThisPoint: marker("FilmThisPoint"),
      },
      "@/components/dashboard/matches/match-detail/film/film-filter-strip": {
        FilmFilterStrip: marker("FilmFilterStrip"),
      },
      "@/components/dashboard/matches/match-detail/film/film-expiry-notice": {
        FilmExpiryNotice: marker("FilmExpiryNotice"),
      },
      "@/components/dashboard/matches/match-detail/film/use-attachment-playback":
        { useAttachmentPlayback: () => ({}) },
      "@/components/dashboard/matches/match-detail/film/record-video-view": {
        recordMatchVideoView: () => {},
      },
      "@/components/dashboard/matches/match-detail/use-match-sides": {
        useMatchSides: () => ({}),
      },
      "@/components/dashboard/matches/match-detail/film-head-context": {
        usePublishFilmHead: () => {},
      },
      "@/components/dashboard/matches/match-detail/film-cut-context": {
        usePendingFilmCut: () => null,
      },
      "@/components/dashboard/matches/match-detail/match-filters/provider": {
        useMatchFilters: () => ({}),
      },
      "@/components/dashboard/matches/match-detail/match-filters/filter-rail": {
        FilterRailProvider: ({ children }: React.PropsWithChildren) => children,
      },
    },
  });
  const { FilmTab } = loader.load(FILM_TAB) as {
    FilmTab: React.ComponentType<{
      video: null;
      entry: MatchFilmEntry;
      unit: "ft";
    }>;
  };
  return renderToStaticMarkup(
    React.createElement(FilmTab, { video: null, entry, unit: "ft" }),
  );
}

const entries: Record<
  "empty" | "expired" | "stale" | "unknown",
  MatchFilmEntry
> = {
  empty: {
    attachment: "absent",
    actions: ALL_ACTIONS,
    problem: null,
    quota: null,
    expiredAt: null,
  },
  expired: {
    attachment: "absent",
    actions: ALL_ACTIONS,
    problem: null,
    quota: null,
    expiredAt: "2026-09-01T00:00:00.000Z",
  },
  stale: {
    attachment: "present",
    actions: ALL_ACTIONS,
    problem: "stale_attachment",
    quota: null,
    expiredAt: null,
  },
  unknown: {
    attachment: null,
    actions: ALL_ACTIONS,
    problem: null,
    quota: null,
    expiredAt: null,
  },
};

const OFFERS = [
  'data-testid="film-entry-actions"',
  'data-testid="film-action-replace"',
  'data-testid="film-action-align"',
  'data-testid="film-action-add"',
  'data-testid="film-action-at-cap"',
  "Add video",
  "Replace video",
  "Adjust alignment",
  "/dashboard/matches/new",
];

test("the unavailable state draws the Replace/Align row for a creator and not under readOnly", () => {
  for (const key of ["stale", "unknown"] as const) {
    const live = render(entries[key], { readOnly: false });
    expect(live, key).toContain('data-testid="film-unavailable"');
    expect(live, key).toContain('data-testid="film-entry-actions"');
    expect(live, key).toContain('data-testid="film-action-replace"');

    const readOnly = render(entries[key], { readOnly: true });
    // The sentence and the Back control stay: it is a report, not a blank.
    expect(readOnly, key).toContain('data-testid="film-unavailable"');
    expect(readOnly, key).toContain('role="alert"');
    expect(readOnly, key).toMatch(/<button[^>]*>Back to the report<\/button>/);
    expect(readOnly, key).toContain(
      `data-film-state="${key === "stale" ? "stale" : "unavailable"}"`,
    );
    for (const offer of OFFERS)
      expect(readOnly, `${key}: ${offer}`).not.toContain(offer);
  }
});

test("the empty state offers Add video to a creator and nothing under readOnly, whatever the source", () => {
  for (const sourceProvider of [null, "swing-vision", "splitstep"]) {
    const live = render(entries.empty, { readOnly: false, sourceProvider });
    expect(live, String(sourceProvider)).toContain("Add video");

    const readOnly = render(entries.empty, { readOnly: true, sourceProvider });
    expect(readOnly, String(sourceProvider)).toMatch(
      /<h2[^>]*>No video for this match<\/h2>/,
    );
    for (const offer of OFFERS)
      expect(readOnly, `${sourceProvider}: ${offer}`).not.toContain(offer);
  }
});

test("the expired state offers Add video to a creator and nothing under readOnly", () => {
  const live = render(entries.expired, { readOnly: false });
  expect(live).toContain('data-testid="film-expired"');
  expect(live).toContain('data-testid="film-action-add"');

  const readOnly = render(entries.expired, { readOnly: true });
  expect(readOnly).toMatch(/<h2[^>]*>This video was removed<\/h2>/);
  for (const offer of OFFERS) expect(readOnly, offer).not.toContain(offer);
});
