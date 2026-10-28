import type { AdminSearchResult } from "@/lib/data/admin-search-server";

/**
 * The `adminSearchTeams` server action, stood in for in the browser bundle
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
