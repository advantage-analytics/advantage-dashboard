import { createClient } from "@/lib/supabase/server";
import type { ProgramRole, Workspace } from "@/lib/workspace/types";

/**
 * What Settings › Teams reads — the list, and the two per-program numbers the
 * detail page needs beside `getTeamSettings` and `getProgramUsage`.
 *
 * The list is built from the workspaces the layout already resolved rather
 * than a second membership query: `listProgramWorkspaces` in
 * `active-workspace-server.ts` is the one place that decides which programs
 * the viewer belongs to and at what standing, and a list that asked the
 * question again could answer it differently.
 *
 * Every RPC here is membership-gated in SQL (`user_program_ids()`), so a
 * hand-typed program id returns zeros rather than someone else's numbers.
 */

export interface TeamListRow {
  id: string;
  name: string;
  team: Workspace["team"];
  role: ProgramRole;
  /** Members holding a seat — `program_seat_usage.used`. */
  memberCount: number;
  crestPath: string | null;
}

export interface SeatUsage {
  seats: number;
  /** Members holding one. */
  used: number;
  /** Unexpired open invites reserving one. */
  pending: number;
}

/**
 * The program's seat ledger. Same RPC the roster reads; parsed the same way —
 * a row-returning function comes back as an array of one.
 */
export async function getProgramSeatUsage(
  programId: string,
): Promise<SeatUsage> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("program_seat_usage", {
    p_program_id: programId,
  });

  if (error) {
    console.error("[teams] could not read seat usage", {
      error: error.message,
    });
    return { seats: 0, used: 0, pending: 0 };
  }

  const row = (Array.isArray(data) ? data[0] : data) as SeatUsage | undefined;
  return row ?? { seats: 0, used: 0, pending: 0 };
}

/**
 * Seconds reserved by jobs that have not finished yet.
 *
 * A SUBSET of `getProgramUsage().usedSeconds`, never an addition to it — the
 * total already counts an unfinished job at its reserved figure. The summary
 * says "includes X reserved", and adding the two would double-count.
 */
export async function getProgramUsagePending(
  programId: string,
  billingMonth: string,
): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("program_usage_pending", {
    p_program_id: programId,
    p_billing_month: billingMonth,
  });

  if (error) {
    console.error("[teams] could not read pending usage", {
      error: error.message,
    });
    return 0;
  }

  return Number(data ?? 0);
}

/**
 * One row per team workspace the viewer belongs to.
 *
 * The seat count is one RPC per program. That is fine: a person holds one to
 * three of these, and the calls run together. `crest_path` is read here rather
 * than carried on the workspace because nothing else in the chrome draws it.
 */
export async function listTeamsForViewer(
  available: readonly Workspace[],
): Promise<TeamListRow[]> {
  const teams = available.filter((workspace) => workspace.kind === "team");
  if (teams.length === 0) return [];

  const supabase = await createClient();
  const ids = teams.map((workspace) => workspace.id);

  const [seatResults, crestResult] = await Promise.all([
    Promise.all(teams.map((workspace) => getProgramSeatUsage(workspace.id))),
    supabase.from("programs").select("id, crest_path").in("id", ids),
  ]);

  const crests = new Map<string, string | null>(
    (
      (crestResult.data ?? []) as { id: string; crest_path: string | null }[]
    ).map((row) => [row.id, row.crest_path]),
  );

  return teams.map((workspace, index) => ({
    id: workspace.id,
    name: workspace.name,
    team: workspace.team,
    role: workspace.role,
    memberCount: seatResults[index].used,
    crestPath: crests.get(workspace.id) ?? null,
  }));
}

/** The bucket a program's crest lives in. One constant, so a move is one edit. */
export const PROGRAM_CRESTS_BUCKET = "program-crests";

/**
 * Public URL for a crest key, or null for none.
 *
 * Built here rather than stored: the bucket is public and the URL is a
 * function of the key, so the row holds the key and nothing else has to be
 * rewritten if the project or bucket ever moves.
 */
export async function crestUrl(
  crestPath: string | null,
): Promise<string | null> {
  if (!crestPath) return null;
  const supabase = await createClient();
  const { data } = supabase.storage
    .from(PROGRAM_CRESTS_BUCKET)
    .getPublicUrl(crestPath);
  return data.publicUrl;
}
