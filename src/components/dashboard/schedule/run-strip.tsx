import { matchWon } from "@/lib/schedule/entry-state";
import type { EntryMatch } from "@/lib/schedule/types";

/**
 * A player's weekend as ticks — 25g's win/loss strip.
 *
 * `--success` / `--danger`, not the `--viz-good` / `--viz-bad` the frame draws
 * with. `colors.css` fences the whole `--viz-*` ramp to charts and says so in
 * as many words; this is chrome sitting next to a name.
 */
export function RunStrip({ matches }: { matches: EntryMatch[] }) {
  const decided = matches
    .map((match) => matchWon(match))
    .filter((won): won is boolean => won !== null);

  if (decided.length === 0) return null;

  return (
    <div className="flex items-center justify-end gap-1.5">
      {decided.map((won, index) => (
        <span
          key={index}
          className="h-3 w-0.5"
          style={{ background: won ? "var(--success)" : "var(--danger)" }}
        />
      ))}
    </div>
  );
}

/** "3–1" for a run. */
export function runRecord(matches: EntryMatch[]): { won: number; lost: number } {
  let won = 0;
  let lost = 0;
  for (const match of matches) {
    const result = matchWon(match);
    if (result === true) won++;
    else if (result === false) lost++;
  }
  return { won, lost };
}
