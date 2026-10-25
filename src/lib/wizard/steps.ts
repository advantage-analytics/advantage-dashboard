/**
 * Wizard step identifiers — the one vocabulary the wizard, a saved draft's
 * row and the Matches page share. Lives in `lib/` so a pure module (the
 * draft row's fields, the MCP seed) can name a step without reaching into
 * the component tree; `new-match-wizard/types.ts` re-exports it.
 *
 * `file` is the drop step for BOTH kinds — a video for a processing provider,
 * an export for an import one. `trim` is the video check that only a
 * processing provider needs. `match` is the last step: there is no confirm
 * step — Save match writes the record, and the match's own page says the rest
 * better than a summary above it could. Design: Upload Wizard v5.
 */
export type Step = "provider" | "file" | "trim" | "match";

export const STEPS: readonly Step[] = ["provider", "file", "trim", "match"];

export function isStep(value: unknown): value is Step {
  return (
    typeof value === "string" && (STEPS as readonly string[]).includes(value)
  );
}
