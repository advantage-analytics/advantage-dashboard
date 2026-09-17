import type { CreateDualInput } from "@/lib/schedule/write-types";
import type {
  MatchEnding,
  OutcomeKind,
  OutcomeSide,
} from "@/lib/schedule/types";

export type AdminLineResult =
  | {
      kind: "score";
      ourGames: number[];
      theirGames: number[];
      ourTiebreaks: (number | null)[];
      theirTiebreaks: (number | null)[];
      opponentLabels: string[];
      ending: { kind: MatchEnding; side: OutcomeSide } | null;
    }
  | { kind: "outcome"; outcome: OutcomeKind; side: OutcomeSide };
export interface AdminDualSubmissionInput {
  operationId: string;
  programId: string;
  event:
    | { kind: "existing"; eventId: string; fingerprint: string }
    | { kind: "new"; dual: CreateDualInput };
  items: { itemId: string; slot: string; result: AdminLineResult }[];
}
export interface AdminResultItemOutcome {
  itemId: string;
  slot: string;
  status: "pending" | "succeeded" | "failed";
  matchId: string | null;
  outcomeId: string | null;
  error: string | null;
}
export type AdminDualSubmissionResult =
  | { ok: false; message: string }
  | {
      ok: true;
      operationId: string;
      eventId: string;
      items: AdminResultItemOutcome[];
    };

/** One singles athlete and one canonical tournament round per operation. */
export interface AdminTournamentSubmissionInput {
  operationId: string;
  itemId: string;
  programId: string;
  event:
    | { kind: "existing"; eventId: string; fingerprint: string }
    | {
        kind: "new";
        tournament: Omit<
          import("@/lib/schedule/write-types").CreateTournamentInput,
          "entries"
        >;
      };
  entry:
    | {
        kind: "existing";
        entryId: string;
        playerId: string;
        fingerprint: string;
      }
    | {
        kind: "new";
        playerId: string;
        playerLabel: string;
        draw: string | null;
        seed: number | null;
      };
  round: string;
  result: AdminLineResult;
}
export type AdminTournamentSubmissionResult =
  | { ok: false; message: string }
  | {
      ok: true;
      operationId: string;
      eventId: string;
      entryId: string;
      item: Omit<AdminResultItemOutcome, "slot"> & { round: string };
    };
