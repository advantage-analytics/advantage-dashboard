/**
 * The Court field's choices — `matches.court_type` as the upload wizard and
 * the Edit match dialog both write it. One list, so a match edited after
 * upload offers the same four surfaces it was saved with.
 */
export const COURT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "Outdoor Hard Court", label: "Hard" },
  { value: "Indoor Hard Court", label: "Hard · Indoor" },
  { value: "Clay Court", label: "Clay" },
  { value: "Grass Court", label: "Grass" },
];

/**
 * The schedule's surface ("hard", "clay", "grass", or a court option already
 * spelled out) to the value the Court field stores. Anything else comes back
 * as it was.
 */
export function surfaceToCourtType(surface: string): string {
  const s = surface.trim().toLowerCase();
  if (s.includes("indoor")) return "Indoor Hard Court";
  if (s.includes("clay")) return "Clay Court";
  if (s.includes("grass")) return "Grass Court";
  if (s.includes("hard")) return "Outdoor Hard Court";
  return surface;
}
