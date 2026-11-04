"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  addNote,
  createTag,
  deleteNote,
  linkTag,
  loadMatchNotes,
  loadMatchTagLinks,
  loadTags,
  unlinkTag,
  type NoteAuthor,
  type PointNote,
  type PointTag,
  type PointTagLink,
} from "@/lib/data/point-notes";
import { sameTagName } from "@/lib/data/point-notes-logic";

/**
 * The film tab's notes and tags for one match: loaded once when the Video
 * view mounts (never on Statistics, never on a read-only report), held here,
 * and written optimistically — each write puts its state back if the
 * database refused it, the way `handleToggleSaved` does for bookmarks.
 *
 * `enabled` is false on the share page and the sample match; the hook then
 * loads nothing and every writer is a no-op.
 *
 * Who may annotate is the SERVER's answer, not this component's: the same two
 * functions the RLS policies call — `point_in_my_workspace` (is the viewer
 * the match's creator, or a member of its program?) and `point_workspace_id`
 * (whose vocabulary the tags come from) — asked once, on the match's first
 * point. Nothing here reads `createdBy` or the active workspace.
 */
export function usePointNotes({
  supabase,
  matchId,
  pointIds,
  enabled,
}: {
  supabase: SupabaseClient;
  matchId: string;
  pointIds: string[];
  enabled: boolean;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [notes, setNotes] = useState<PointNote[]>([]);
  const [authors, setAuthors] = useState<Map<string, NoteAuthor>>(new Map());
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [vocabulary, setVocabulary] = useState<PointTag[]>([]);
  const [links, setLinks] = useState<PointTagLink[]>([]);
  const [attempt, setAttempt] = useState(0);
  /** Null until the server has answered. */
  const [inWorkspace, setInWorkspace] = useState<boolean | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);

  // The point ids as one stable key, so a re-render with the same points is
  // not a reload (the provider hands a fresh array on every bookmark toggle).
  const idsKey = pointIds.join(",");

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // A retry, or a different match, starts over.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus("loading");
    (async () => {
      try {
        await load();
      } catch {
        // A thrown read (network, a client without auth) is the same as a
        // refused one: the card offers Try again.
        if (!cancelled) setStatus("error");
      }
    })();
    async function load() {
      const ids = idsKey ? idsKey.split(",") : [];
      const first = ids[0];
      if (!first) {
        if (!cancelled) {
          setInWorkspace(false);
          setStatus("ready");
        }
        return;
      }
      const [member, workspace] = await Promise.all([
        supabase.rpc("point_in_my_workspace", { p_point_id: first }),
        supabase.rpc("point_workspace_id", { p_point_id: first }),
      ]);
      if (cancelled) return;
      if (member.error) throw member.error;
      const mine = member.data === true;
      const wsId = (workspace.data as string | null) ?? null;
      setInWorkspace(mine);
      setAccountId(wsId);
      // Outside the workspace there is nothing to read: RLS would return no
      // rows, and the card draws no notes or tags.
      if (!mine) {
        setStatus("ready");
        return;
      }
      const [user, notesRes, linksRes, tagsRes] = await Promise.all([
        supabase.auth.getUser(),
        loadMatchNotes(supabase, matchId, ids),
        loadMatchTagLinks(supabase, ids),
        wsId
          ? loadTags(supabase, wsId)
          : Promise.resolve({ ok: true as const, data: [] as PointTag[] }),
      ]);
      if (cancelled) return;
      const uid = user.data.user?.id ?? null;
      setViewerId(uid);
      if (!notesRes.ok) {
        setStatus("error");
        return;
      }
      setNotes(notesRes.data.notes);
      setAuthors(notesRes.data.authors);
      if (linksRes.ok) setLinks(linksRes.data);
      if (tagsRes.ok) setVocabulary(tagsRes.data);
      setStatus("ready");
    }
    return () => {
      cancelled = true;
    };
  }, [enabled, supabase, matchId, idsKey, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const send = useCallback(
    async (pointId: string, body: string): Promise<boolean> => {
      if (!enabled) return false;
      const res = await addNote(supabase, pointId, body);
      if (!res.ok) return false;
      setNotes((prev) => [...prev, res.data]);
      // The viewer's own name may not be in the author map yet (their first
      // note on this match); fetch it so the row says more than "Teammate".
      if (viewerId && !authors.has(viewerId)) {
        const again = await loadMatchNotes(
          supabase,
          matchId,
          idsKey ? idsKey.split(",") : [],
        );
        if (again.ok) setAuthors(again.data.authors);
      }
      return true;
    },
    [enabled, supabase, matchId, idsKey, viewerId, authors],
  );

  const remove = useCallback(
    async (noteId: string) => {
      if (!enabled) return;
      const before = notes;
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      const res = await deleteNote(supabase, noteId);
      if (!res.ok) setNotes(before);
    },
    [enabled, supabase, notes],
  );

  const addTag = useCallback(
    async (pointId: string, tag: PointTag) => {
      if (!enabled) return;
      const link = { pointId, tagId: tag.id };
      setLinks((prev) => [...prev, link]);
      const res = await linkTag(supabase, pointId, tag.id);
      if (!res.ok)
        setLinks((prev) =>
          prev.filter((l) => !(l.pointId === pointId && l.tagId === tag.id)),
        );
    },
    [enabled, supabase],
  );

  const createAndAdd = useCallback(
    async (pointId: string, name: string) => {
      if (!enabled || !accountId) return;
      const existing = vocabulary.find((t) => sameTagName(t.name, name));
      const res = existing
        ? { ok: true as const, data: existing }
        : await createTag(supabase, accountId, name);
      if (!res.ok) return;
      if (!existing)
        setVocabulary((prev) =>
          [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)),
        );
      await addTag(pointId, res.data);
    },
    [enabled, accountId, vocabulary, supabase, addTag],
  );

  const removeTag = useCallback(
    async (pointId: string, tag: PointTag) => {
      if (!enabled) return;
      setLinks((prev) =>
        prev.filter((l) => !(l.pointId === pointId && l.tagId === tag.id)),
      );
      const res = await unlinkTag(supabase, pointId, tag.id);
      if (!res.ok) setLinks((prev) => [...prev, { pointId, tagId: tag.id }]);
    },
    [enabled, supabase],
  );

  const tagsById = useMemo(
    () => new Map(vocabulary.map((t) => [t.id, t])),
    [vocabulary],
  );

  /** One point's notes (oldest first) and applied tags. */
  const forPoint = useCallback(
    (pointId: string) => ({
      notes: notes.filter((n) => n.pointId === pointId),
      tags: links
        .filter((l) => l.pointId === pointId)
        .map((l) => tagsById.get(l.tagId))
        .filter((t): t is PointTag => t != null),
    }),
    [notes, links, tagsById],
  );

  return {
    status,
    authors,
    viewerId,
    vocabulary,
    canTag: accountId != null,
    /**
     * Whether the viewer is in the match's workspace (the server's
     * `point_in_my_workspace`). A viewer who sees a match only through a
     * claimed player seat is not: RLS shows them no notes and refuses their
     * writes, so the card draws neither. True until answered, so the
     * skeleton shows while loading.
     */
    inWorkspace: inWorkspace !== false,
    forPoint,
    retry,
    send,
    remove,
    addTag,
    createAndAdd,
    removeTag,
  };
}
