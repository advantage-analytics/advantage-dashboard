"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./admin-guard";
import { LOAD_TEAMS_ERROR, storedConferenceFields } from "./conference-format";
import {
  readConferenceTeams,
  type AdminConferenceTeam,
} from "@/lib/data/admin-conferences-server";

/**
 * The Admin › Conferences writes.
 *
 * `conferences` is read-only for every client role, so each write here is one
 * of the `security definer` RPCs in `20260915100100_admin_conference_rpcs.sql`.
 * Same split as `admin-program-actions.ts`: `requireAdmin()` first, then the
 * **SESSION client** for the RPC, because the RPCs gate on `is_admin()` from
 * `auth.uid()` and write that id into `program_audit_log.actor_user_id` — the
 * service key would put no one in the actor column. The one service-role read
 * (`loadConferenceTeams`) goes through the loader, which stays server-only and
 * is unguarded — this action's `requireAdmin()` is its gate.
 */

const ADMIN_PATH = "/admin";

const NOT_AUTHORIZED = "Not authorized.";

const DUPLICATE_SQLSTATE = "23505";
const DUPLICATE_MESSAGE = "A conference with that name already exists.";

/** `raise exception … using errcode = 'P0001'` — written to be shown verbatim. */
const RAISED_SQLSTATE = "P0001";
/** The RPCs' own validation (`22023`) is also a readable sentence. */
const INVALID_SQLSTATE = "22023";
const NOT_FOUND_SQLSTATE = "P0002";
const FORBIDDEN_SQLSTATE = "42501";

export interface ConferenceInput {
  name: string;
  shortName: string | null;
  division: string | null;
  website: string | null;
}

export type ConferenceActionError = { ok: false; error: string };

export type SaveConferenceResult =
  { ok: true; id: string } | ConferenceActionError;

export type MergeConferencesResult =
  { ok: true; targetId: string; moved: number } | ConferenceActionError;

export type ConferenceWriteResult = { ok: true } | ConferenceActionError;

export type LoadConferenceTeamsResult =
  { ok: true; teams: AdminConferenceTeam[] } | ConferenceActionError;

function mapError(
  error: { code?: string; message: string },
  fallback: string,
): string {
  const message = error.message?.trim();
  switch (error.code) {
    case DUPLICATE_SQLSTATE:
      return DUPLICATE_MESSAGE;
    case RAISED_SQLSTATE:
    case INVALID_SQLSTATE:
      return message || fallback;
    case NOT_FOUND_SQLSTATE:
      return "That conference or team no longer exists.";
    case FORBIDDEN_SQLSTATE:
      return NOT_AUTHORIZED;
    default:
      return fallback;
  }
}

/** Client-side checks that give a better sentence than the RPC would. */
function prepareInput(input: ConferenceInput):
  | {
      ok: true;
      name: string;
      shortName: string | null;
      division: string | null;
      website: string | null;
    }
  | ConferenceActionError {
  const stored = storedConferenceFields(input);
  if (stored.name.length < 2) {
    return { ok: false, error: "Give the conference a name." };
  }
  if (input.website?.trim() && !stored.website) {
    return { ok: false, error: "That doesn't look like a website." };
  }

  return { ok: true, ...stored };
}

async function upsert(
  id: string | null,
  input: ConferenceInput,
  fallback: string,
): Promise<SaveConferenceResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: NOT_AUTHORIZED };

  const prepared = prepareInput(input);
  if (!prepared.ok) return prepared;

  // SESSION client: `admin_upsert_conference` gates on `is_admin()`.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_upsert_conference", {
    p_id: id,
    p_name: prepared.name,
    p_short_name: prepared.shortName,
    p_division: prepared.division,
    p_website: prepared.website,
  });

  if (error) return { ok: false, error: mapError(error, fallback) };

  const savedId = typeof data === "string" ? data : null;
  if (!savedId) return { ok: false, error: fallback };

  revalidatePath(ADMIN_PATH, "layout");
  return { ok: true, id: savedId };
}

/** Returns the new id so the page can select the row it just added. */
export async function createConference(
  input: ConferenceInput,
): Promise<SaveConferenceResult> {
  return upsert(null, input, "Couldn't add that conference.");
}

/** A rename fans out to every program's `conference` text in the database. */
export async function saveConference(
  id: string,
  input: ConferenceInput,
): Promise<SaveConferenceResult> {
  if (!id) return { ok: false, error: "Couldn't save that conference." };
  return upsert(id, input, "Couldn't save that conference.");
}

/** Moves every program on `sourceId` to `targetId`, then deletes the source. */
export async function mergeConferences(
  sourceId: string,
  targetId: string,
): Promise<MergeConferencesResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: NOT_AUTHORIZED };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_merge_conferences", {
    p_source: sourceId,
    p_target: targetId,
  });

  if (error) {
    return {
      ok: false,
      error: mapError(error, "Couldn't merge those conferences."),
    };
  }

  revalidatePath(ADMIN_PATH, "layout");
  return { ok: true, targetId, moved: typeof data === "number" ? data : 0 };
}

/** Refused by the RPC (`P0001`, shown verbatim) while any team points here. */
export async function deleteConference(
  id: string,
): Promise<ConferenceWriteResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: NOT_AUTHORIZED };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_conference", {
    p_id: id,
  });

  if (error) {
    return {
      ok: false,
      error: mapError(error, "Couldn't delete that conference."),
    };
  }

  revalidatePath(ADMIN_PATH, "layout");
  return { ok: true };
}

/** Attaches one program to this conference, moving it off any other. */
export async function addTeamToConference(
  programId: string,
  conferenceId: string,
): Promise<ConferenceWriteResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: NOT_AUTHORIZED };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_program_conference", {
    p_program_id: programId,
    p_conference_id: conferenceId,
  });

  if (error) {
    return {
      ok: false,
      error: mapError(error, "Couldn't add that team to the conference."),
    };
  }

  revalidatePath(ADMIN_PATH, "layout");
  return { ok: true };
}

/** The drawer's Teams section — a read, so no revalidation. */
export async function loadConferenceTeams(
  conferenceId: string,
): Promise<LoadConferenceTeamsResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: NOT_AUTHORIZED };

  try {
    const teams = await readConferenceTeams(conferenceId);
    return { ok: true, teams };
  } catch (error) {
    console.error("[admin conferences] could not load teams", {
      conferenceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: LOAD_TEAMS_ERROR };
  }
}
