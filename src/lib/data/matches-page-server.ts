import type { SupabaseClient } from "@supabase/supabase-js";
import { reconcileBeforePageRead } from "@/lib/services/splitstep/reconcile";
import {
  analysisFor,
  loadMatchAnalysis,
} from "@/lib/data/match-analysis-server";
import {
  type DbMatch,
  type DisplayMatch,
  toTeamSide,
  toViewerSide,
  transformDbMatch,
} from "@/lib/data/matches-list-types";
import {
  getMyPlayerIds,
  getMyPlayerIdsOrThrow,
} from "@/lib/data/player-identity-server";
import { canonicalRosterIds, type RosterIdRow } from "@/lib/data/roster-ids";

export async function enrichMatches(
  supabase: SupabaseClient,
  data: (DbMatch & {
    player2_id: string | null;
    created_by: string | null;
  })[],
  user: { id: string },
): Promise<DisplayMatch[]> {
  // Collect unique opponent user IDs to fetch hand/backhand
  const opponentIds = [
    ...new Set(
      data.map((r) => r.player2_id).filter((id): id is string => id != null),
    ),
  ];

  // Both follow-ups key off the ids in `data` and neither reads the other's
  // output, so they overlap rather than stack. Analysis state is keyed by
  // match id, so feeding it every row — including any that transformDbMatch
  // later drops — costs nothing but an unread map entry.
  const [{ data: opponents }, jobs] = await Promise.all([
    opponentIds.length > 0
      ? supabase
          .from("users")
          .select("id, hand, backhand")
          .in("id", opponentIds)
      : Promise.resolve({ data: null }),
    (async () => {
      // Vendor-status reconciliation, sequenced before the analysis read
      // so what the poll learns is what this list renders. Never fatal.
      // Lives here and on the match detail page, not in
      // loadMatchAnalysis — client components import that module, and the
      // reconciler's admin/Azure dependencies must never enter a client
      // module graph.
      await reconcileBeforePageRead(
        data.map((r) => r.id),
        "matches",
      );
      return loadMatchAnalysis(
        supabase,
        data.map((r) => r.id),
        { reap: true },
      );
    })(),
  ]);

  const opponentMap = new Map<
    string,
    { hand: string | null; backhand: string | null }
  >();
  for (const o of opponents ?? []) {
    opponentMap.set(o.id, { hand: o.hand, backhand: o.backhand });
  }

  return data
    .map((row) => {
      // `transformDbMatch` ignores the viewer — it decides the winner from
      // the score, player1 against player2, not relative to whoever is
      // looking. That is what makes one row safe to show a coach and the
      // player alike, and why a team scope needs no second transform. The
      // personal list reads player1 as "you", so it turns its rows afterwards
      // (`withViewerSide`).
      const display = transformDbMatch(row, user.id);
      if (!display) return null;
      display.canManage = row.created_by === user.id;
      const opp = row.player2_id ? opponentMap.get(row.player2_id) : undefined;
      if (opp) {
        display.player2Hand = opp.hand ?? undefined;
        display.player2Backhand = opp.backhand ?? undefined;
      }
      // Matches with no job row resolve to `imported` or `manual` here.
      display.analysis = analysisFor(jobs, display);
      return display;
    })
    .filter((m): m is DisplayMatch => m !== null);
}

/**
 * The personal list's rows turned to the viewer's side. The row reads player1
 * as "you", so a match that seats the viewer as player two would otherwise name
 * them as their own opponent, with the result and every set backwards. Throws
 * when the ids cannot be read: the boundary's retry beats a list that may be
 * the wrong way round with nothing to say so.
 */
export async function withViewerSide(
  rows: (DbMatch & { player2_id: string | null; created_by: string | null })[],
  viewerId: string,
  matches: Promise<DisplayMatch[]>,
): Promise<DisplayMatch[]> {
  const [list, myPlayerIds] = await Promise.all([
    matches,
    getMyPlayerIdsOrThrow(),
  ]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return list.map((match) => {
    const row = byId.get(match.id);
    return row ? toViewerSide(match, row, myPlayerIds, viewerId) : match;
  });
}

/**
 * Each match's players resolved to their profiles on this team's roster, so
 * the team table can link the name and `?rosterPlayer=` can find a player in
 * either seat (`roster-player-cut.ts`). Both of a claimed player's ids fold
 * onto the one profile (`canonicalRosterIds`); an id the roster no longer
 * holds — an archived player, whose matches keep their old id — resolves to
 * null rather than to a link that 404s. A failed roster read links nobody.
 *
 * Given the stored `rows`, it also turns each row so the program's player
 * comes first (`toTeamSide`): the viewer's own player ids, then the
 * program's one answer to "is this id ours?" (`canonicalRosterIds`, both of
 * a claimed player's ids — `roster-ids.ts`). A turned row's opponent is the
 * stored seat one, so its hand is read for the Opponent facets.
 */
export async function withRosterProfiles(
  supabase: SupabaseClient,
  programId: string,
  matches: Promise<DisplayMatch[]>,
  rows?: readonly Pick<DbMatch, "id" | "score" | "player1_id">[],
): Promise<DisplayMatch[]> {
  // A turned row's opponent sat in seat one, whose hand the list's enrichment
  // never read (it reads seat two's). Read seat one's hands alongside the
  // rest — not after the turn — so "Opponent: left-handed" does not quietly
  // drop turned rows and the list pays no second round trip.
  const seatOneIds = [
    ...new Set(
      (rows ?? [])
        .map((row) => row.player1_id)
        .filter((id): id is string => id != null),
    ),
  ];
  const [list, roster, myPlayerIds, seatOneHands] = await Promise.all([
    matches,
    supabase.rpc("program_roster_full", { p_program_id: programId }),
    // Never fatal: a failed read only means the viewer's own seat is not
    // preferred over a teammate's, and the roster test still turns the row.
    rows ? getMyPlayerIds() : Promise.resolve([] as string[]),
    seatOneIds.length > 0
      ? supabase
          .from("users")
          .select("id, hand, backhand")
          .in("id", seatOneIds)
          .then(({ data }) => data ?? [])
      : Promise.resolve([]),
  ]);
  if (roster.error) {
    // Degrades to "links nobody" — the list still renders — but a
    // `?rosterPlayer=` cut then finds no seat, so say why in the logs.
    console.error("[matches] could not read the roster to resolve players", {
      programId,
      error: roster.error.message,
    });
  }
  const canonical = canonicalRosterIds((roster.data ?? []) as RosterIdRow[]);
  const profileOf = (id: string | null | undefined) =>
    id ? (canonical.get(id) ?? null) : null;
  const byId = new Map((rows ?? []).map((row) => [row.id, row]));

  const oriented = list.map((match) => {
    const linked: DisplayMatch = {
      ...match,
      player1: { ...match.player1, profileId: profileOf(match.player1.id) },
      player2: { ...match.player2, profileId: profileOf(match.player2.id) },
    };
    const row = byId.get(match.id);
    return row
      ? toTeamSide(linked, row, myPlayerIds, (id) => canonical.has(id))
      : linked;
  });

  const handOf = new Map(
    seatOneHands.map((h) => [
      h.id as string,
      { hand: h.hand as string | null, backhand: h.backhand as string | null },
    ]),
  );
  return oriented.map((m) => {
    const opp = m.turned && m.player2.id ? handOf.get(m.player2.id) : null;
    return opp
      ? {
          ...m,
          player2Hand: opp.hand ?? undefined,
          player2Backhand: opp.backhand ?? undefined,
        }
      : m;
  });
}
