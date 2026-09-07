import type { TeamSettingsData } from "@/lib/data/team-settings-server";
import type { UploadPolicy } from "@/lib/workspace/types";

/**
 * What the identity card edits — one draft, one save, because the six fields
 * and the upload policy are one row in `programs`.
 */
export interface IdentityDraft {
  schoolName: string;
  team: "mens" | "womens";
  conference: string;
  homeVenue: string;
  defaultSurface: "hard" | "clay" | "grass" | "carpet" | "";
  season: string;
  uploadPolicy: UploadPolicy;
}

export function toDraft(data: TeamSettingsData): IdentityDraft {
  return {
    schoolName: data.program.schoolName,
    team: data.program.team,
    conference: data.program.conference ?? "",
    homeVenue: data.program.homeVenue ?? "",
    defaultSurface: (data.program.defaultSurface as IdentityDraft["defaultSurface"] | null) ?? "",
    season: data.program.season ?? "",
    uploadPolicy: data.program.uploadPolicy,
  };
}
