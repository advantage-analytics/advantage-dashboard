"use client";

import { MenuSelect } from "@/components/ui/menu-select";
import { MATCH_TYPE_OPTIONS, isPracticeMatch } from "@/lib/matches/match-type";
import { FieldCaption } from "./FieldCaption";
import type { FormData } from "./types";
import { WizardNotice } from "./WizardNotice";

/**
 * Match type on the Details step — the Context grid's first cell, and the
 * notice a Practice answer brings with it (design: practice sessions, boards
 * 1–2).
 *
 * `formData.matchType` is overloaded (`lib/matches/match-type.ts`): the preset
 * seed writes `Singles`, a doubles line writes `Doubles`, and `job-request.ts`'s
 * caller reads that `Doubles`. So this field never rewrites a value it did not
 * offer — it only reads one of its own options back, and shows "Not set" for
 * anything else — and Doubles hides it outright, so the one value the vendor
 * path depends on can't be picked over.
 */

export type MatchTypeValue = (typeof MATCH_TYPE_OPTIONS)[number]["value"];

/** The option the stored value names, or `undefined` ("Not set") for any other. */
export function matchTypeFieldValue(
  raw: string | null | undefined,
): MatchTypeValue | undefined {
  return MATCH_TYPE_OPTIONS.find((option) => option.value === raw)?.value;
}

/** Doubles owns `matchType` (the vendor refuses it); the field steps aside. */
export function showsMatchTypeField(raw: string | null | undefined): boolean {
  return raw !== "Doubles";
}

/**
 * What picking an event does to Match type: a tournament or a dual names its
 * type; any other event leaves the current answer as it is.
 */
export function matchTypeForEventKind(
  kind: FormData["eventKind"],
  current: string | null | undefined,
): string {
  if (kind === "tournament") return "Tournament";
  if (kind === "dual") return "Dual Match";
  return current ?? "";
}

export function MatchTypeCell({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (next: MatchTypeValue) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {/* Optional, so no asterisk — the Edit match dialog's caption. */}
      <FieldCaption label="Match type" />
      <MenuSelect
        label="Match type"
        variant="underline"
        placeholder="Not set"
        value={matchTypeFieldValue(value)}
        options={MATCH_TYPE_OPTIONS}
        onChange={onChange}
      />
    </div>
  );
}

/** One person the Practice notice names. */
export interface PracticeProfile {
  name: string;
  isSelf?: boolean;
}

function possessive({ name, isSelf }: PracticeProfile): string {
  if (isSelf) return "your";
  const trimmed = name.trim();
  if (!trimmed) return "the player's";
  return trimmed.endsWith("s") ? `${trimmed}'` : `${trimmed}'s`;
}

/** "Ace's profile" — or, with a teammate opponent, "Ace's and Ben's profiles". */
export function practiceProfilesPhrase(profiles: PracticeProfile[]): string {
  const owners = profiles.map(possessive);
  if (owners.length <= 1) return `${owners[0] ?? "the player's"} profile`;
  return `${owners.slice(0, -1).join(", ")} and ${owners.at(-1)} profiles`;
}

/**
 * Under Context while the answer is Practice. `profiles` is the seam for the
 * teammate case: today the caller passes the player alone; once an opponent
 * can be a teammate, it passes both and the sentence names both.
 */
export function PracticeNotice({
  matchType,
  profiles,
}: {
  matchType: string | null | undefined;
  profiles: PracticeProfile[];
}) {
  if (!isPracticeMatch(matchType)) return null;
  return (
    <WizardNotice tone="note">
      <span>
        <b className="font-medium">Practice.</b> Shows on{" "}
        {practiceProfilesPhrase(profiles)} under Practice. Win–loss, the season
        record, head-to-head and season statistics all leave it out.
      </span>
    </WizardNotice>
  );
}
