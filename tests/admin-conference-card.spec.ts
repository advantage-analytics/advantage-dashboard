import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  AdminTeamConference,
  AdminTeamConferenceTeam,
} from "@/lib/data/admin-team-server";
import { createLoader } from "./fixtures/vm-modules";

/**
 * Admin › Teams › `#conference` — the Conference rail card (T17).
 *
 * Rendered offline through `fixtures/vm-modules`. The card is a client
 * component, so the router, `next/link` and the two server actions are
 * stubbed; everything else — `MenuSelect`, `ConferenceMark`, `StatePill`,
 * `divisionLongLabel` — is the real module. The menu itself only mounts on
 * open, so what is asserted here is the trigger, the body and the links; the
 * `{ ok: false }` path is the `DialogProblem` the card renders from state.
 */

type CardProps = {
  programId: string;
  conference: AdminTeamConference | null;
  currentLabel: string | null;
  options: readonly string[];
};

function load() {
  const loader = createLoader({
    stubs: {
      "next/navigation": { useRouter: () => ({ refresh() {} }) },
      "next/link": {
        __esModule: true,
        default: ({
          href,
          children,
          ...rest
        }: {
          href: string;
          children: React.ReactNode;
        }) => React.createElement("a", { href, ...rest }, children),
      },
      "@/components/admin/admin-people-card": { TEXT_ACTION: "text-action" },
      "@/lib/services/programs/admin-conference-actions": {
        addTeamToConference: async () => ({ ok: true }),
        conferenceIdForLabel: async () => ({ ok: true, id: "c1" }),
      },
    },
  });
  return loader.load("src/components/admin/admin-conference-card.tsx") as {
    AdminConferenceCard: React.ComponentType<CardProps>;
    conferenceMeta: (
      c: Pick<
        AdminTeamConference,
        "division" | "teamCount" | "onAdvantageCount"
      >,
    ) => string;
    CONFERENCE_SIBLINGS_SHOWN: number;
  };
}

function html(props: CardProps): string {
  const { AdminConferenceCard } = load();
  return renderToStaticMarkup(React.createElement(AdminConferenceCard, props));
}

function text(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function team(
  id: string,
  name: string,
  status = "unclaimed",
): AdminTeamConferenceTeam {
  return {
    id,
    name,
    crestUrl: null,
    status,
    claimed: status === "active" || status === "claim_pending",
  };
}

const IVY: AdminTeamConference = {
  id: "ivy",
  name: "Ivy League",
  shortName: "IVY",
  division: "D1",
  teamCount: 16,
  onAdvantageCount: 2,
  teams: [
    team("harvard", "Harvard University Women's"),
    team("yale", "Yale University Women's", "active"),
    team("princeton", "Princeton University Women's", "claim_pending"),
    team("brown", "Brown University Women's"),
    team("penn", "University of Pennsylvania Women's"),
  ],
};

const BASE = {
  programId: "columbia",
  currentLabel: "Ivy League (IVY)",
  options: ["Ivy League (IVY)", "Patriot League (PL)"],
};

test.describe("AdminConferenceCard", () => {
  test("titles the card and prints the mark, name and counts", () => {
    const out = text(html({ ...BASE, conference: IVY }));
    expect(out).toContain("Conference");
    expect(out).toContain("IVY");
    expect(out).toContain("Ivy League");
    expect(out).toContain("Division I · 16 teams · 2 on Advantage");
    expect(out).toContain("Change");
  });

  test("lists three siblings with state chips and links, then counts the rest", () => {
    const markup = html({ ...BASE, conference: IVY });
    const out = text(markup);
    expect(out).toContain("Harvard University Women's Unclaimed");
    expect(out).toContain("Yale University Women's Claimed");
    expect(out).toContain("Princeton University Women's Claim pending");
    expect(out).not.toContain("Brown University");
    expect(out).toContain("2 more");
    expect(markup).toContain('href="/admin/teams/harvard"');
    expect(markup).toContain('href="/admin/conferences?id=ivy"');
    expect(markup).not.toContain('href="/admin/teams/columbia"');
  });

  test("no conference reads as an empty line with Set conference", () => {
    const out = text(html({ ...BASE, currentLabel: null, conference: null }));
    expect(out).toContain("No conference yet");
    expect(out).toContain("Set conference");
    expect(out).not.toContain("null");
    expect(out).not.toMatch(/\bChange\b/);
  });

  test("the meta line skips a missing division and singularises one team", () => {
    const { conferenceMeta } = load();
    expect(
      conferenceMeta({ division: null, teamCount: 1, onAdvantageCount: 0 }),
    ).toBe("1 team · 0 on Advantage");
    expect(
      conferenceMeta({ division: "NAIA", teamCount: 9, onAdvantageCount: 3 }),
    ).toBe("NAIA · 9 teams · 3 on Advantage");
  });
});
