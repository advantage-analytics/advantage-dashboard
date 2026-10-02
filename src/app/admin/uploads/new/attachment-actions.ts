"use server";
import {
  listAdminAttachmentTargets,
  prepareAdminAttachmentTarget,
} from "@/lib/data/admin-attachment-server";
export async function loadAdminAttachmentTargetsAction(programId: string) {
  return listAdminAttachmentTargets(programId);
}
export async function prepareAdminAttachmentAction(input: {
  programId: string;
  matchId: string;
  operationId: string;
  itemId: string;
}) {
  return prepareAdminAttachmentTarget(input);
}
