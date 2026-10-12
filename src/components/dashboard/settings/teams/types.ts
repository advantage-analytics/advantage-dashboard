import type { Squad } from "@/lib/data/squad";
import type { TeamSettingsData } from "@/lib/data/team-settings-server";
import type { EventsPolicy, UploadPolicy } from "@/lib/workspace/types";

/**
 * What the identity card edits — one draft, one save, because the five fields
 * and both policies are one row in `programs`.
 */
export interface IdentityDraft {
  schoolName: string;
  /** Null until the owner picks one — a custom org created before setup asked. */
  team: Squad | null;
  conference: string;
  homeVenue: string;
  defaultSurface: "hard" | "clay" | "grass" | "carpet" | "";
  uploadPolicy: UploadPolicy;
  eventsPolicy: EventsPolicy;
}

export function toDraft(data: TeamSettingsData): IdentityDraft {
  return {
    schoolName: data.program.schoolName,
    team: data.program.team,
    conference: data.program.conference ?? "",
    homeVenue: data.program.homeVenue ?? "",
    defaultSurface:
      (data.program.defaultSurface as IdentityDraft["defaultSurface"] | null) ??
      "",
    uploadPolicy: data.program.uploadPolicy,
    eventsPolicy: data.program.eventsPolicy,
  };
}
