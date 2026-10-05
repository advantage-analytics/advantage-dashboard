/**
 * The onboarding flow's step graph. Pure — no `react` or `next/*` imports,
 * like `answers.ts` — so the Back transitions can be pinned by an offline spec
 * without rendering the flow.
 *
 * 1 = name (1.2) · 2 = persona (1.3) · 3 = college question (1.4) ·
 * 4 = guardian step (3.1) · 5 = recording source (1.5) · 6 = heard about (1.7)
 *
 * 4 keeps its number so the guardian branch is untouched; the player's run is
 * 1 → 2 → 3 → 5 → 6, and the junior branch is 1 → 2 → 4.
 */
export type Step = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Where Back goes from each step — the step that led to it, never a step the
 * user skipped past. Both branches off the persona step (3 for "I play", 4
 * for "I manage a junior's account") return to it, so a parent who tapped the
 * wrong persona recovers without reloading. `null` on step 1: nothing is
 * before the name.
 */
const PREVIOUS: Record<Step, Step | null> = {
  1: null,
  2: 1,
  3: 2,
  4: 2,
  5: 3,
  6: 5,
};

export function previousStep(step: Step): Step | null {
  return PREVIOUS[step];
}

/**
 * The screens each persona actually walks through, in order. "Coach" finishes
 * on the persona step itself, so its run is two screens long.
 */
type PathPersona = "play" | "junior" | "coach";

const PATH: Record<PathPersona, readonly Step[]> = {
  play: [1, 2, 3, 5, 6],
  junior: [1, 2, 4],
  coach: [1, 2],
};

/**
 * The eyebrow for a step: "Step n" until the persona is picked (the length of
 * the run isn't known yet), then "Step n of total" counted along the path that
 * persona takes. Counting by position, not by the step's own number, is what
 * keeps the player's run reading 3, 4, 5 across the skipped guardian step.
 * Steps 1 and 2 stay un-totalled: the persona is chosen ON step 2.
 */
export function stepLabel(step: Step, persona: PathPersona | null): string {
  if (!persona || step <= 2) return `Step ${step}`;
  const path = PATH[persona];
  const position = path.indexOf(step) + 1;
  return position > 0 ? `Step ${position} of ${path.length}` : `Step ${step}`;
}
