"use server";

/**
 * What the Edit Match dialog can offer beyond the row itself: the roster a
 * team match's player is chosen from, and the hand and backhand already known
 * for either player.
 *
 * Every read runs as the signed-in user, scoped to a match they uploaded. The
 * "known" hands come from somewhere the viewer may read: their own `users` row,
 * or earlier matches in the same workspace. Another person's profile row is
 * RLS-private, so a teammate's style is read from their last match instead.
 * The match being edited is excluded from those lookups — its own empty fields
 * are exactly what a suggestion is for.
 */

import { createClient } from "@/lib/supabase/server";
import { normalizedPersonName } from "@/lib/data/person-name";
import type { RosterFullRow } from "@/lib/data/roster-shared";
import type { RosterMenuPlayer } from "@/components/dashboard/matches/new-match-wizard/RosterMenu";
import {
  eligibleRosterOptions,
  type OwnProfileRow,
} from "@/components/dashboard/matches/new-match-wizard/subject-eligibility";

export interface KnownStyle {
  hand: "right" | "left" | null;
  backhand: "one-handed" | "two-handed" | null;
  /** How the note under the fields says where this came from. */
  source: string;
}

/** A roster row as the wizard's For menu draws it — the same list. */
export type EditRosterPlayer = RosterMenuPlayer;

export interface EditMatchSuggestions {
  roster: EditRosterPlayer[];
  playerStyle: KnownStyle | null;
  opponentStyle: KnownStyle | null;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

function styleFrom(
  hand: string | null,
  backhand: string | null,
  source: string,
): KnownStyle | null {
  const h = hand === "right" || hand === "left" ? hand : null;
  const b =
    backhand === "one-handed" || backhand === "two-handed" ? backhand : null;
  return h || b ? { hand: h, backhand: b, source } : null;
}

async function ownMatch(supabase: Supabase, matchId: string, userId: string) {
  const { data } = await supabase
    .from("matches")
    .select("id, program_id, player1_id, player1_name, player2_name")
    .eq("id", matchId)
    .eq("created_by", userId)
    .maybeSingle();
  return data as {
    id: string;
    program_id: string | null;
    player1_id: string | null;
    player1_name: string;
    player2_name: string;
  } | null;
}

/** The newest other match in this match's workspace that recorded a style. */
async function lastPlayerStyle(
  supabase: Supabase,
  scope: { matchId: string; programId: string | null; userId: string },
  player: { playerId: string | null; name: string },
): Promise<KnownStyle | null> {
  let query = supabase
    .from("matches")
    .select("player_hand, player_backhand")
    .neq("id", scope.matchId)
    .or("player_hand.not.is.null,player_backhand.not.is.null")
    .order("date", { ascending: false })
    .limit(1);
  query = scope.programId
    ? query.eq("program_id", scope.programId)
    : query.eq("created_by", scope.userId).is("program_id", null);
  query = player.playerId
    ? query.eq("player1_id", player.playerId)
    : query.ilike("player1_name", player.name.trim());
  const { data } = await query.maybeSingle();
  const row = data as {
    player_hand: string | null;
    player_backhand: string | null;
  } | null;
  return row
    ? styleFrom(row.player_hand, row.player_backhand, "from their last match")
    : null;
}

async function ownProfileStyle(
  supabase: Supabase,
  userId: string,
): Promise<KnownStyle | null> {
  const { data } = await supabase
    .from("users")
    .select("hand, backhand")
    .eq("id", userId)
    .maybeSingle();
  const row = data as { hand: string | null; backhand: string | null } | null;
  return row ? styleFrom(row.hand, row.backhand, "from your profile") : null;
}

async function isViewer(
  supabase: Supabase,
  programId: string | null,
  playerId: string | null,
  userId: string,
): Promise<boolean> {
  if (!playerId) return false;
  if (playerId === userId) return true;
  if (!programId) return false;
  const { data } = await supabase
    .from("program_players")
    .select("id")
    .eq("id", playerId)
    .eq("program_id", programId)
    .eq("claimed_by_user_id", userId)
    .maybeSingle();
  return data !== null;
}

async function styleForPlayer(
  supabase: Supabase,
  scope: { matchId: string; programId: string | null; userId: string },
  player: { playerId: string | null; name: string },
): Promise<KnownStyle | null> {
  // Independent reads, so they run together; the profile wins when it's theirs.
  const [viewer, own, last] = await Promise.all([
    isViewer(supabase, scope.programId, player.playerId, scope.userId),
    ownProfileStyle(supabase, scope.userId),
    lastPlayerStyle(supabase, scope, player),
  ]);
  return (viewer && own) || last;
}

export async function editMatchSuggestions(input: {
  matchId: string;
}): Promise<EditMatchSuggestions> {
  const empty: EditMatchSuggestions = {
    roster: [],
    playerStyle: null,
    opponentStyle: null,
  };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;
  const match = await ownMatch(supabase, input.matchId, user.id);
  if (!match) return empty;
  const scope = {
    matchId: match.id,
    programId: match.program_id,
    userId: user.id,
  };

  const rosterRead = async (): Promise<EditRosterPlayer[]> => {
    if (!match.program_id) return [];
    const [{ data: rows }, { data: invites }, { data: ownRows }] =
      await Promise.all([
        supabase.rpc("program_roster_full", {
          p_program_id: match.program_id,
        }),
        // Admitted for coaches only; a player sees the rows without invites.
        supabase
          .from("program_invites")
          .select("player_id, email")
          .eq("program_id", match.program_id)
          .is("accepted_at", null),
        supabase
          .from("program_players")
          .select(
            "id, program_id, first_name, last_name, email, class_year, lineup_spot, claimed_by_user_id",
          )
          .eq("program_id", match.program_id)
          .eq("claimed_by_user_id", user.id)
          .is("archived_at", null)
          .is("merged_into_id", null)
          .limit(1),
      ]);
    const invitedByPlayer = new Map<string, string>();
    for (const invite of (invites ?? []) as {
      player_id: string | null;
      email: string;
    }[]) {
      if (invite.player_id) invitedByPlayer.set(invite.player_id, invite.email);
    }
    const own = ((ownRows ?? []) as OwnProfileRow[])[0] ?? null;
    return eligibleRosterOptions(
      (rows ?? []) as RosterFullRow[],
      own,
      match.program_id,
      user.id,
    ).map((row) => ({
      ...row,
      invitedEmail: invitedByPlayer.get(row.playerId) ?? null,
    }));
  };

  const opponentRead = async (): Promise<KnownStyle | null> => {
    const wanted = normalizedPersonName(match.player2_name);
    if (!wanted) return null;
    let query = supabase
      .from("matches")
      .select("player2_name, opponent_hand, opponent_backhand")
      .neq("id", match.id)
      .or("opponent_hand.not.is.null,opponent_backhand.not.is.null")
      .ilike("player2_name", match.player2_name.trim())
      .order("date", { ascending: false })
      .limit(5);
    query = match.program_id
      ? query.eq("program_id", match.program_id)
      : query.eq("created_by", user.id).is("program_id", null);
    const { data } = await query;
    const row = (
      (data ?? []) as {
        player2_name: string;
        opponent_hand: string | null;
        opponent_backhand: string | null;
      }[]
    ).find((r) => normalizedPersonName(r.player2_name) === wanted);
    return row
      ? styleFrom(
          row.opponent_hand,
          row.opponent_backhand,
          "from your last meeting",
        )
      : null;
  };

  const [roster, playerStyle, opponentStyle] = await Promise.all([
    rosterRead(),
    styleForPlayer(supabase, scope, {
      playerId: match.player1_id,
      name: match.player1_name,
    }),
    opponentRead(),
  ]);
  return { roster, playerStyle, opponentStyle };
}

/** The known style for a player just picked from the roster. */
export async function playerStyleFor(input: {
  matchId: string;
  playerId: string;
  playerName: string;
}): Promise<KnownStyle | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const match = await ownMatch(supabase, input.matchId, user.id);
  if (!match) return null;
  return styleForPlayer(
    supabase,
    { matchId: match.id, programId: match.program_id, userId: user.id },
    { playerId: input.playerId, name: input.playerName },
  );
}
