import type { SupabaseClient } from "@supabase/supabase-js";

import { getInitials } from "@/lib/data/match-utils";
import { USER_AVATARS_BUCKET } from "@/lib/user/avatar";

import { normalizeNoteBody, normalizeTagName } from "./point-notes-logic";

/**
 * The Video tab's point notes and tags, read and written with the BROWSER
 * client — the same path point bookmarks take (`film-tab.tsx`
 * `handleToggleSaved`). RLS is the boundary
 * (`20261104021629_point_notes_and_tags.sql`): these functions never send an
 * author or creator id, so the `auth.uid()` defaults apply, and a refusal
 * comes back as `{ ok: false }` for the caller to roll its optimistic state
 * back.
 *
 * Read-only reports (the share page, the sample match) never call any of
 * this: the film tab checks `readOnly` first.
 */

export interface PointNote {
  id: string;
  pointId: string;
  authorId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
}

export interface NoteAuthor {
  name: string | null;
  initials: string;
  avatarUrl: string | null;
}

export interface PointTag {
  id: string;
  name: string;
}

export interface PointTagLink {
  pointId: string;
  tagId: string;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const NOTE_COLUMNS = "id, point_id, author_id, body, created_at, edited_at";

function toNote(row: {
  id: string;
  point_id: string;
  author_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
}): PointNote {
  return {
    id: row.id,
    pointId: row.point_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
  };
}

/**
 * Every note on the match's points, oldest first, plus a name and avatar for
 * each author. Names come from `point_note_authors` (SECURITY DEFINER):
 * `public.users` only lets a user read their own row.
 */
export async function loadMatchNotes(
  supabase: SupabaseClient,
  matchId: string,
  pointIds: string[],
): Promise<Result<{ notes: PointNote[]; authors: Map<string, NoteAuthor> }>> {
  if (pointIds.length === 0)
    return { ok: true, data: { notes: [], authors: new Map() } };

  const [notesRes, authorsRes] = await Promise.all([
    supabase
      .from("point_notes")
      .select(NOTE_COLUMNS)
      .in("point_id", pointIds)
      .order("created_at", { ascending: true }),
    supabase.rpc("point_note_authors", { p_match_id: matchId }),
  ]);
  if (notesRes.error) return { ok: false, error: notesRes.error.message };

  const authors = new Map<string, NoteAuthor>();
  for (const row of (authorsRes.data ?? []) as {
    user_id: string;
    display_name: string | null;
    avatar_path: string | null;
  }[]) {
    authors.set(row.user_id, {
      name: row.display_name,
      initials: row.display_name ? getInitials(row.display_name) : "?",
      avatarUrl: row.avatar_path
        ? supabase.storage
            .from(USER_AVATARS_BUCKET)
            .getPublicUrl(row.avatar_path).data.publicUrl
        : null,
    });
  }
  return {
    ok: true,
    data: { notes: (notesRes.data ?? []).map(toNote), authors },
  };
}

export async function addNote(
  supabase: SupabaseClient,
  pointId: string,
  raw: string,
): Promise<Result<PointNote>> {
  const body = normalizeNoteBody(raw);
  if (!body) return { ok: false, error: "invalid" };
  const { data, error } = await supabase
    .from("point_notes")
    .insert({ point_id: pointId, body })
    .select(NOTE_COLUMNS)
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "failed" };
  return { ok: true, data: toNote(data) };
}

export async function editNote(
  supabase: SupabaseClient,
  noteId: string,
  raw: string,
): Promise<Result<PointNote>> {
  const body = normalizeNoteBody(raw);
  if (!body) return { ok: false, error: "invalid" };
  const { data, error } = await supabase
    .from("point_notes")
    .update({ body })
    .eq("id", noteId)
    .select(NOTE_COLUMNS)
    .maybeSingle();
  // Zero rows back means RLS refused it (not the author).
  if (error || !data)
    return { ok: false, error: error?.message ?? "forbidden" };
  return { ok: true, data: toNote(data) };
}

export async function deleteNote(
  supabase: SupabaseClient,
  noteId: string,
): Promise<Result<null>> {
  const { data, error } = await supabase
    .from("point_notes")
    .delete()
    .eq("id", noteId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "forbidden" };
  return { ok: true, data: null };
}

/** The workspace's tag vocabulary, A→Z. */
export async function loadTags(
  supabase: SupabaseClient,
  accountId: string,
): Promise<Result<PointTag[]>> {
  const { data, error } = await supabase
    .from("point_tags")
    .select("id, name")
    .eq("account_id", accountId)
    .order("name", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as PointTag[] };
}

export async function loadMatchTagLinks(
  supabase: SupabaseClient,
  pointIds: string[],
): Promise<Result<PointTagLink[]>> {
  if (pointIds.length === 0) return { ok: true, data: [] };
  const { data, error } = await supabase
    .from("point_tag_links")
    .select("point_id, tag_id")
    .in("point_id", pointIds);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({ pointId: r.point_id, tagId: r.tag_id })),
  };
}

/**
 * A new tag in the workspace. A name that already exists (the table's
 * case-insensitive unique index, `23505`) resolves to the existing tag, so a
 * second tab or a teammate creating the same name never errors.
 */
export async function createTag(
  supabase: SupabaseClient,
  accountId: string,
  raw: string,
): Promise<Result<PointTag>> {
  const name = normalizeTagName(raw);
  if (!name) return { ok: false, error: "invalid" };
  const { data, error } = await supabase
    .from("point_tags")
    .insert({ account_id: accountId, name })
    .select("id, name")
    .single();
  if (!error && data) return { ok: true, data: data as PointTag };
  if (error?.code === "23505") {
    const existing = await supabase
      .from("point_tags")
      .select("id, name")
      .eq("account_id", accountId)
      // Escaped: a `%` or `_` in the name is a literal character here.
      .ilike("name", name.replace(/[\\%_]/g, "\\$&"))
      .maybeSingle();
    if (existing.data) return { ok: true, data: existing.data as PointTag };
  }
  return { ok: false, error: error?.message ?? "failed" };
}

export async function linkTag(
  supabase: SupabaseClient,
  pointId: string,
  tagId: string,
): Promise<Result<null>> {
  const { error } = await supabase
    .from("point_tag_links")
    .insert({ point_id: pointId, tag_id: tagId });
  // Already linked (another tab, a teammate) is the state we wanted.
  if (error && error.code !== "23505")
    return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function unlinkTag(
  supabase: SupabaseClient,
  pointId: string,
  tagId: string,
): Promise<Result<null>> {
  const { error } = await supabase
    .from("point_tag_links")
    .delete()
    .eq("point_id", pointId)
    .eq("tag_id", tagId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}
