/**
 * Which source a fresh wizard opens on — the one rule, shared by the mount
 * effect that selects it and the progress-bar initialiser that measures it.
 *
 * Kept out of `useUploadMatchWizard.ts` on purpose: that module is a client
 * hook that pulls in `next/navigation` and the Supabase browser client, and
 * this rule has to be testable offline. Nothing here imports React.
 */

import { providers } from "@/lib/providers";
import {
  isProviderSupported,
  providerKindOrNull,
} from "@/lib/services/upload/providers";
import type { ProviderId } from "@/lib/services/upload/types";

/**
 * The source a new match starts on.
 *
 * Resolved from the registry by KIND rather than named, so the wizard stays
 * written against "your own video" instead of against a particular vendor.
 */
export const DEFAULT_PROVIDER_ID: ProviderId | null =
  providers.find(
    (p) => p.available !== false && providerKindOrNull(p.id) === "processing",
  )?.id ?? null;

export interface StartingProviderInputs {
  /** Named by the link that opened the wizard (`?source=`). */
  linked: string | null;
  /** The last source chosen in the picker, as read from localStorage. */
  stored: string | null;
  /**
   * How the viewer said they record, from onboarding
   * (`providerForRecordingSource(viewer.recordingSource)`).
   */
  preferred: string | null;
}

/**
 * First supported value of `linked` > `stored` > `preferred` >
 * `DEFAULT_PROVIDER_ID`.
 *
 * A link is the choice just made; a stored provider is one made in the picker
 * on an earlier visit; the onboarding answer is a guess about every visit, so
 * it ranks below anything the person actually chose. Every tier is checked
 * against the registry — a retired id in any of them falls through rather than
 * opening the wizard on a source it cannot run.
 *
 * Draft and preset are not tiers here: each carries a whole match and is
 * resolved before this is consulted.
 */
export function resolveStartingProvider({
  linked,
  stored,
  preferred,
}: StartingProviderInputs): ProviderId | null {
  for (const candidate of [linked, stored, preferred]) {
    if (candidate && isProviderSupported(candidate)) return candidate;
  }
  return DEFAULT_PROVIDER_ID;
}
