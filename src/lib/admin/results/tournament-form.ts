import { draftResult, type DualResultDraft } from "./dual-form";
import { ROUND_ORDER } from "@/lib/schedule/format";
import { isValidDateString } from "@/lib/admin/validation";
import type { AdminTournamentSubmissionInput } from "./types";
import type { CreateTournamentInput } from "@/lib/schedule/write-types";
export type TournamentDetails = Omit<
  CreateTournamentInput,
  "entries" | "adScoring"
> & { adScoring: boolean | null };
export interface AdminTournamentContext {
  eventId: string;
  fingerprint: string;
  tournament: TournamentDetails;
  entries: {
    id: string;
    playerId: string;
    label: string;
    draw: string | null;
    seed: number | null;
    fingerprint: string;
    saved: Record<string, string>;
    forfeit: string | null;
  }[];
}
export interface TournamentDraft {
  tournament: TournamentDetails;
  entryId: string;
  playerId: string;
  playerLabel: string;
  draw: string;
  seed: string;
  round: string;
  score: DualResultDraft["score"];
  outcome: DualResultDraft["outcome"];
}
export function validateTournamentDraft(
  d: TournamentDraft,
  existing: AdminTournamentContext | null,
) {
  const errors: string[] = [];
  const date = isValidDateString;
  if (
    !existing &&
    (!d.tournament.name.trim() ||
      !date(d.tournament.startsOn) ||
      !date(d.tournament.endsOn) ||
      d.tournament.endsOn < d.tournament.startsOn)
  )
    errors.push("Name the tournament and choose valid start and end dates.");
  const entry = existing?.entries.find((e) => e.id === d.entryId);
  if (d.entryId && !entry) errors.push("Reload the selected athlete entry.");
  if (
    !existing &&
    (d.tournament.name.length > 200 ||
      (d.tournament.host !== null &&
        (!d.tournament.host.trim() || d.tournament.host.length > 200)) ||
      d.tournament.surface.length > 50 ||
      ![1, 3, 5].includes(d.tournament.bestOf) ||
      typeof d.tournament.adScoring !== "boolean")
  )
    errors.push("Complete a valid tournament name, host and format.");
  if (!entry && existing?.entries.some((e) => e.playerId === d.playerId))
    errors.push("Choose this player’s existing entry.");
  if (!d.playerId || !d.playerLabel.trim())
    errors.push("Choose an eligible player.");
  if (!ROUND_ORDER.includes(d.round)) errors.push("Choose a round.");
  if (entry?.saved[d.round] || entry?.forfeit)
    errors.push(
      "This recorded result is read-only. Choose an unrecorded round.",
    );
  if (
    !entry &&
    d.seed &&
    (!/^\d+$/.test(d.seed) || Number(d.seed) < 1 || Number(d.seed) > 2147483647)
  )
    errors.push("Seed must be a positive whole number.");
  if (d.draw.length > 200) errors.push("Draw must be 200 characters or fewer.");
  const parsed = draftResult({
    line: {
      slot: "S1",
      discipline: "singles",
      position: 1,
      playerUserIds: [d.playerId],
      playerLabels: [d.playerLabel],
      opponentLabels: [],
    },
    score: d.score,
    outcome: d.outcome,
  });
  if (parsed.error) errors.push(parsed.error);
  if (!parsed.result && !parsed.error)
    errors.push("Enter a score or an outcome.");
  if (
    parsed.result?.kind === "score" &&
    parsed.result.ourGames.length > d.tournament.bestOf
  )
    errors.push("The score exceeds the tournament format.");
  return {
    errors,
    result: parsed.result,
    valid: errors.length === 0 && !!parsed.result,
  };
}
export function freezeTournamentRequest(
  programId: string,
  d: TournamentDraft,
  existing: AdminTournamentContext | null,
  uuid: () => string,
): AdminTournamentSubmissionInput {
  const checked = validateTournamentDraft(d, existing);
  if (!checked.valid || !checked.result)
    throw new Error("Complete valid changes before review.");
  const entry = existing?.entries.find((e) => e.id === d.entryId);
  return JSON.parse(
    JSON.stringify({
      operationId: uuid(),
      itemId: uuid(),
      programId,
      event: existing
        ? {
            kind: "existing",
            eventId: existing.eventId,
            fingerprint: existing.fingerprint,
          }
        : { kind: "new", tournament: d.tournament },
      entry: entry
        ? {
            kind: "existing",
            entryId: entry.id,
            playerId: entry.playerId,
            fingerprint: entry.fingerprint,
          }
        : {
            kind: "new",
            playerId: d.playerId,
            playerLabel: d.playerLabel,
            draw: d.draw.trim() || null,
            seed: d.seed ? Number(d.seed) : null,
          },
      round: d.round,
      result: checked.result,
    }),
  );
}
