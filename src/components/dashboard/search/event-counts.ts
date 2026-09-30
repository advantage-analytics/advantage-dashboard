/**
 * Event names the palette's Events group offers, with how many matches each
 * has. A match filed with no event (`tournament_name: null`) is skipped: an
 * event group is a searchable event name, and "no event" is not one.
 */
export function countEvents(
  rows: ReadonlyArray<{ tournament_name: string | null }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of rows) {
    if (m.tournament_name === null) continue;
    counts.set(m.tournament_name, (counts.get(m.tournament_name) ?? 0) + 1);
  }
  return counts;
}
