/** The shared wizard stores full court labels; an unanswered optional field is null. */
export function adminUploadCourt(value: unknown): string | null | undefined {
  if (value == null || value === "") return null;
  return typeof value === "string" &&
    [
      "Outdoor Hard Court",
      "Indoor Hard Court",
      "Clay Court",
      "Grass Court",
      "Hard",
      "Clay",
      "Grass",
      "Carpet",
    ].includes(value)
    ? value
    : undefined;
}
