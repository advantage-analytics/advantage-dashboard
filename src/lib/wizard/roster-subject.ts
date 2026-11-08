import type { RosterPlayerOption } from "@/lib/data/roster-shared";
import type { RosterSubject } from "@/components/dashboard/matches/new-match-wizard/subject-eligibility";
import type { MatchDraft } from "@/components/dashboard/matches/new-match-wizard/types";

/**
 * Who the wizard's For field opens on in a team workspace — a `?player=` link,
 * a resumed draft's saved player, or an older draft's saved name — resolved
 * against the active program's roster. Null when none of them names someone
 * on it, and the picker asks.
 *
 * Pure, so the ranking is pinned offline (`tests/roster-subject.spec.ts`);
 * `roster-subject-server.ts` feeds it the roster.
 *
 * In order, first hit wins:
 *
 * 1. **The link's id.** The newer choice. A miss falls through rather than
 *    ending the search: a stale link must not throw away a draft whose own
 *    player is still on the roster.
 * 2. **The draft's saved id** (`MatchDraft.subject`).
 * 3. **An older draft's saved name**, for rows written before the id was
 *    stored (`subject` absent, not `null`). Taken only when exactly ONE roster player carries that name,
 *    character for character: two players sharing it is exactly the case
 *    where guessing hands every statistic to the wrong one
 *    (`docs/ui-revamp-guardrails.md` §3.1). Never for a draft that DID store
 *    an id — that id was the answer, and its miss means the player left, not
 *    that someone with the same name should stand in. Never for a preset
 *    draft, whose line names its own player.
 *
 * Only (2) is the draft's own answer. (1) and (3) PRE-FILL the For field and
 * the wizard still opens on the step that asks it — see `draftResumeStep()`:
 * a guess is shown, never acted on unseen.
 *
 * Ids are matched in both eras, as the roster's own links send them: a
 * `program_players.id`, or a claimed player's older login id. The result is
 * always the roster's own `playerId` and `name`, never the input.
 */
export function resolveRosterSubject(
  roster: readonly RosterPlayerOption[],
  input: {
    linkPlayerId?: string | null;
    draft?: Pick<MatchDraft, "subject" | "formData" | "preset"> | null;
  },
): RosterSubject | null {
  const toSubject = (row: RosterPlayerOption): RosterSubject => ({
    kind: "roster",
    playerId: row.playerId,
    name: row.name,
  });
  const byId = (id: string | null | undefined) =>
    id
      ? roster.find((row) => row.playerId === id || row.userId === id)
      : undefined;

  const { linkPlayerId, draft } = input;
  const hit = byId(linkPlayerId) ?? byId(draft?.subject?.playerId);
  if (hit) return toSubject(hit);

  // `undefined`, not `null`: a row written since the field exists stores
  // `null` for "no answer yet", and its saved name may be a parsed export's
  // account holder rather than anyone the person picked.
  if (draft && draft.subject === undefined && !draft.preset) {
    // The payload is JSON the viewer wrote; a non-string here is a stale or
    // hand-edited row, and must not take the page down.
    const saved: unknown = draft.formData?.playerName;
    const name = typeof saved === "string" ? saved.trim() : "";
    if (name) {
      const named = roster.filter((row) => row.name === name);
      if (named.length === 1) return toSubject(named[0]);
    }
  }
  return null;
}
