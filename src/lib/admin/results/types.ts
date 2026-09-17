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
