import type {
  EntryOutcome,
  OutcomeKind,
  OutcomeSide,
} from "@/lib/schedule/types";

/** The words a saved, no-score outcome reads as on a locked lineup line. */
const OUTCOME_LABEL: Record<`${OutcomeSide}-${OutcomeKind}`, string> = {
  "theirs-forfeit": "We won — opponent forfeited",
  "ours-forfeit": "We lost — our side forfeited",
  "theirs-default": "We won — opponent defaulted",
  "ours-default": "We lost — our side defaulted",
  "theirs-withdrawal": "We won — opponent withdrew",
  "ours-withdrawal": "We lost — our side withdrew",
};

export function resultLabelFromOutcome(
  outcome: Pick<EntryOutcome, "kind" | "side">,
): string {
  return OUTCOME_LABEL[`${outcome.side}-${outcome.kind}`];
}
