import type { LineupLineInput } from "./actions";

/** Only stable identities establish duplicates; typed labels are not IDs. */
export function validateLineup(
  lines: readonly LineupLineInput[],
): { slot: string; reason: string }[] {
  const errors: { slot: string; reason: string }[] = [];
  const pairs = new Map<string, string>();

  for (const line of lines) {
    const ids = line.playerUserIds.filter((id) => id.length > 0);
    if (new Set(ids).size !== ids.length) {
      errors.push({
        slot: line.slot,
        reason: `${line.slot} selects the same athlete more than once. Choose distinct athletes for this line.`,
      });
      continue;
    }

    // Singles participation and other pairings are allowed. An incomplete
    // pair cannot establish the identity of both athletes.
    if (line.discipline !== "doubles" || ids.length !== 2) continue;
    const key = JSON.stringify([...ids].sort());
    const firstSlot = pairs.get(key);
    if (firstSlot !== undefined) {
      errors.push({
        slot: line.slot,
        reason: `${line.slot} repeats the doubles pair selected on ${firstSlot}. Choose a different pair.`,
      });
    } else {
      pairs.set(key, line.slot);
    }
  }

  return errors;
}
