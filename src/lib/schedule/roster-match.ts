/**
 * Which roster person a typed name means.
 *
 * Lives here rather than in the components that call it because
 * `format.ts`'s `splitNames` — the first thing both of these do — already
 * scopes itself to exactly this boundary: "applied on submit, and when
 * comparing against the roster". Two `"use client"` components each owning
 * half of that rule is how the two ends drifted apart in the first place, and
 * a pure function reachable only by importing a component drags that
 * component's whole graph — `next/navigation`, the server actions, the
 * Supabase server client — into anything that wants to test it.
 */
import { normalizedPersonName } from "@/lib/data/person-name";
import { splitNames } from "@/lib/schedule/format";
import type { LadderPlayer } from "@/lib/data/roster-server";

/**
 * Roster ids for the names typed into an entry's field.
 *
 * This resolves a typed label to the `userId` the entry — and eventually the
 * match recorded under it — is attributed to, so it is deliberately exact:
 * `normalizedPersonName` settles case and whitespace and nothing else. No
 * nicknames, no initials, no edit distance. A looser rule here would attach an
 * athlete's match to a different athlete, and nothing on screen would say so.
 *
 * Both sides go through the same normalization, which is the whole fix. Each
 * end trims and neither collapses: `splitNames` trims the label, and
 * `program_roster_full` builds `display_name` as
 * `btrim(first_name || ' ' || last_name)`. One trailing space in `first_name`
 * therefore reaches this list as "Dana  Brooks", which never met a typed
 * "Dana Brooks" even though the two render identically.
 *
 * A label matching nobody contributes NO id rather than a near-miss — the entry
 * still records the typed name, which is how a challenge match against someone
 * who has not accepted an invite yet gets written down. `splitNames` drops
 * blank parts, so an empty label can never reach the roster comparison.
 */
export function rosterIdsForLabels(raw: string, roster: LadderPlayer[]): string[] {
  return splitNames(raw)
    .map((label) => {
      const typed = normalizedPersonName(label);
      return roster.find((player) => normalizedPersonName(player.name) === typed)
        ?.userId;
    })
    .filter((id): id is string => Boolean(id));
}

/**
 * Whoever the ladder offered that the lineup does not name.
 *
 * The lineup field clears its roster ids the moment a coach types in it
 * (`lineup-editor.tsx`), so the only thing left to compare is the label — which
 * is why both sides go through `normalizedPersonName`. Each end trims and
 * neither collapses: `program_roster_full` builds `display_name` as
 * `btrim(first_name || ' ' || last_name)`, so one trailing space in
 * `first_name` left a ladder row spelled "Dana  Brooks" on the bench while
 * "Dana Brooks" stood in S1 — the same athlete, twice on one screen.
 *
 * Exact beyond case and whitespace, deliberately: a fuzzier rule would hide a
 * player the coach has NOT fielded, and an absent bench name is a much quieter
 * error than a duplicated one.
 */
export function benchFromLines(
  lines: { ourLabels: string[] }[],
  ladder: LadderPlayer[]
): LadderPlayer[] {
  const named = new Set(
    lines.flatMap((line) =>
      splitNames(line.ourLabels.join(" / ")).map((label) =>
        normalizedPersonName(label)
      )
    )
  );
  return ladder.filter((player) => !named.has(normalizedPersonName(player.name)));
}
