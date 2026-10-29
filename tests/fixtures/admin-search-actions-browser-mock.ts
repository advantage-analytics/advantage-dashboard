import type { AdminSearchResult } from "@/lib/data/admin-search-server";
import type { AdminSearchHit } from "@/components/admin/search/types";

/**
 * The `adminSearch` / `adminSearchTeams` server actions, stood in for in the browser bundle
 * `tests/admin-search.spec.ts` drives. A server action cannot be bundled, so
 * this answers from a fixed list — or, while the spec has set
 * `window.__adminSearchFails`, rejects the way Safari's `fetch` does when the
 * network drops or the page unloads mid-request.
 */
declare global {
  interface Window {
    __adminSearchFails?: boolean;
  }
}

const TEAMS: AdminSearchResult[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Stanford Women's Tennis",
    subtitle: "D-I · ACC",
    conferenceId: null,
    conferenceLabel: "ACC",
  },
];

export async function adminSearchTeams(
  term: string,
): Promise<AdminSearchResult[]> {
  await new Promise((done) => setTimeout(done, 20));
  if (window.__adminSearchFails) throw new TypeError("Load failed");
  const needle = term.trim().toLowerCase();
  return TEAMS.filter((team) => team.name.toLowerCase().includes(needle));
}

const HITS: AdminSearchHit[] = [
  {
    kind: "team",
    id: "11111111-1111-4111-8111-111111111111",
    title: "Stanford University Women's",
    subtitle: "D1 · ACC",
    href: "/admin/teams/11111111-1111-4111-8111-111111111111",
    markUrl: null,
    shortCode: null,
  },
  {
    kind: "person",
    id: "22222222-2222-4222-8222-222222222222",
    title: "Stan Smith",
    subtitle: "stan@example.com",
    href: "/admin/pilots",
    markUrl: null,
    shortCode: null,
  },
  {
    kind: "conference",
    id: "33333333-3333-4333-8333-333333333333",
    title: "Atlantic Coast Conference",
    subtitle: "ACC · D1",
    href: "/admin/conferences?id=33333333-3333-4333-8333-333333333333",
    markUrl: null,
    shortCode: "ACC",
  },
];

export async function adminSearch(term: string): Promise<AdminSearchHit[]> {
  await new Promise((done) => setTimeout(done, 20));
  if (window.__adminSearchFails) throw new TypeError("Load failed");
  const needle = term.trim().toLowerCase();
  return HITS.filter((hit) => hit.title.toLowerCase().includes(needle));
}
