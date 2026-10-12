import type { ProgramApprovalReading } from "@/lib/workspace/upload-eligibility";

/**
 * May the admin console upload for a program in this state?
 *
 * Approval is a gate on what a program's own members may do — chiefly spend
 * the video budget before anyone has confirmed who they are. An administrator
 * uploading on a team's behalf is the reviewer, so an unclaimed program and
 * one still `claim_pending` are both uploadable from the console. `suspended`
 * is the one deliberate stop and holds here too.
 *
 * The seven `admin_*` upload RPCs make the same decision in SQL
 * (`status <> 'suspended'`); change one and you must change the other.
 */
export function adminCanUploadFor(status: string | null | undefined): boolean {
  return Boolean(status) && status !== "suspended";
}

/**
 * The approval reading the shared wizard decides on in admin mode: every
 * uploadable state reads as `active`, so `uploadEligibility()` asks the
 * console nothing about a claim it does not need.
 */
export function adminUploadApproval(
  status: string | null | undefined,
): ProgramApprovalReading {
  if (!status) return "unknown";
  return adminCanUploadFor(status) ? "active" : "suspended";
}
