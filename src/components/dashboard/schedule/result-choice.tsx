"use client";

import { MenuSelect, type MenuOption } from "@/components/ui/menu-select";
import type {
  EntryOutcome,
  OutcomeKind,
  OutcomeSide,
} from "@/lib/schedule/types";

export type ResultChoiceValue =
  "played" | "clear" | `${OutcomeSide}-${OutcomeKind}`;

export const RESULT_CHOICE_OPTIONS = [
  { value: "played", label: "Played — enter score" },
  { value: "theirs-forfeit", label: "We won — opponent forfeited" },
  { value: "ours-forfeit", label: "We lost — our side forfeited" },
  { value: "theirs-default", label: "We won — opponent defaulted" },
  { value: "ours-default", label: "We lost — our side defaulted" },
  { value: "theirs-withdrawal", label: "We won — opponent withdrew" },
  { value: "ours-withdrawal", label: "We lost — our side withdrew" },
] as const satisfies readonly MenuOption<ResultChoiceValue>[];

export function resultChoiceFromOutcome(
  outcome: Pick<EntryOutcome, "kind" | "side">,
): ResultChoiceValue {
  return `${outcome.side}-${outcome.kind}`;
}

/** The same result words on a selector and a saved, read-only line. */
export function resultLabelFromOutcome(
  outcome: Pick<EntryOutcome, "kind" | "side">,
) {
  const value = resultChoiceFromOutcome(outcome);
  return RESULT_CHOICE_OPTIONS.find((option) => option.value === value)!.label;
}

export function outcomeFromResultChoice(value: ResultChoiceValue): {
  kind: OutcomeKind;
  side: OutcomeSide;
} | null {
  if (value === "played" || value === "clear") return null;
  const [side, kind] = value.split("-") as [OutcomeSide, OutcomeKind];
  return { kind, side };
}

export function ResultChoice({
  value,
  onChange,
  canClear,
  disabled = false,
}: {
  value: ResultChoiceValue;
  onChange: (value: ResultChoiceValue) => void;
  canClear: boolean;
  disabled?: boolean;
}) {
  const options: readonly MenuOption<ResultChoiceValue>[] = canClear
    ? [
        ...RESULT_CHOICE_OPTIONS,
        { value: "clear", label: "Clear saved outcome" },
      ]
    : RESULT_CHOICE_OPTIONS;

  return (
    <MenuSelect
      label="Result type"
      value={value}
      options={options}
      onChange={onChange}
      variant="underline"
      width={280}
      disabled={disabled}
    />
  );
}
