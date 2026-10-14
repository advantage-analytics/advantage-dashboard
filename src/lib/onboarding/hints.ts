import type { WorkspaceKind } from "@/lib/workspace/types";
import type { HintId } from "@/lib/onboarding/tours";

/**
 * The shell's one-card hints: where each one points, which side it opens on,
 * what it says, and when it is due. Pure — no `react` or `next/*` imports,
 * like `tours.ts` — so every rule is pinned by an offline spec
 * (`tests/onboarding-hints.spec.ts`). `HintRunner` renders them.
 */

/** The `data-tour="<id>"` value each hint anchors to in the shell. */
export const HINT_ANCHOR: Record<HintId, string> = {
  "workspace-switcher": "workspace-switcher",
  "activity-tray": "activity-tray",
};

/** The switcher sits in the sidebar (opens right); the tray in the header (opens below). */
export const HINT_SIDE: Record<HintId, "right" | "bottom"> = {
  "workspace-switcher": "right",
  "activity-tray": "bottom",
};

export interface HintCopyFacts {
  /** The team workspace the viewer is now in; the switcher hint names it. */
  teamName?: string;
}

export function hintCopy(
  hint: HintId,
  facts: HintCopyFacts,
): { title: string; body: string } {
  switch (hint) {
    case "workspace-switcher":
      return {
        title: `You're in ${facts.teamName} now.`,
        body: "Switch back to your own matches here.",
      };
    case "activity-tray":
      return { title: "Your upload keeps going.", body: "Track it here." };
  }
}

/**
 * The switcher hint: the viewer is in a team workspace, has somewhere to
 * switch back to, and has not dismissed it before.
 */
export function workspaceHintDue({
  activeKind,
  workspaceCount,
  doneAt,
}: {
  activeKind: WorkspaceKind;
  workspaceCount: number;
  doneAt: string | null;
}): boolean {
  return activeKind === "team" && workspaceCount > 1 && doneAt === null;
}

/**
 * The tray hint: an upload is in flight, the viewer has left the wizard that
 * started it (`armed` — it was started this session), and has not dismissed
 * it before.
 */
export function activityHintDue({
  inFlightCount,
  onWizard,
  armed,
  doneAt,
}: {
  inFlightCount: number;
  onWizard: boolean;
  armed: boolean;
  doneAt: string | null;
}): boolean {
  return doneAt === null && armed && !onWizard && inFlightCount > 0;
}
