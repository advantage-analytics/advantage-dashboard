"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROGRAM_CRESTS_BUCKET } from "@/lib/data/teams-server";
import { requireAdmin } from "./admin-guard";

/**
 * Upload, replace and remove a conference's crest (Admin › Conferences).
 *
 * The sequence is `adminUploadProgramCrest`'s: upload a new stamped object,
 * point the row at it, then remove whatever it replaced — and if the row write
 * fails, take the new object back down so a failed save leaves no stray file.
 * The stamp keeps the CDN from serving the old image under a fixed key.
 *
 * One difference: there is no `set_conference_crest` RPC, so the
 * `conferences.crest_path` write is a plain service-role update. That is why
 * `requireAdmin()` runs first in every action here — it is the only gate. The
 * storage writes are service role too: the `program-crests` bucket's client
 * policies admit a write only under a program the caller staffs, and
 * `conferences/` is never one (migration `20261028213239_conference_crests`).
 *
 * Objects live at `conferences/<conference_id>/crest-<stamp>.<ext>`. The
 * bucket enforces 512 KB and png / jpeg / webp / svg; both are restated here
 * so a refusal is a sentence, not a 413.
 */

type CrestOutcome = { ok: true } | { ok: false; error: string };

const NOT_AUTHORIZED = "Not authorized.";

const CREST_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const CREST_MAX_BYTES = 524_288;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only ever remove objects under this conference's own prefix. */
function ownsPath(conferenceId: string, path: string | null): path is string {
  return !!path && path.startsWith(`conferences/${conferenceId}/`);
}

async function currentCrestPath(
  conferenceId: string,
): Promise<{ ok: true; path: string | null } | { ok: false }> {
  const { data, error } = await createAdminClient()
    .from("conferences")
    .select("crest_path")
    .eq("id", conferenceId)
    .maybeSingle();
  if (error || !data) return { ok: false };
  return { ok: true, path: (data.crest_path as string | null) ?? null };
}

/** `formData`: `conferenceId` and `file`. */
export async function adminUploadConferenceCrest(
  formData: FormData,
): Promise<CrestOutcome> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: NOT_AUTHORIZED };

  const conferenceId = String(formData.get("conferenceId") ?? "");
  const file = formData.get("file");

  if (!UUID.test(conferenceId)) {
    return { ok: false, error: "No conference named." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an image first." };
  }
  const ext = CREST_TYPES[file.type];
  if (!ext) return { ok: false, error: "Use a PNG, JPG, WebP or SVG." };
  if (file.size > CREST_MAX_BYTES) {
    return { ok: false, error: "Keep the crest under 512 KB." };
  }

  const current = await currentCrestPath(conferenceId);
  if (!current.ok) {
    return { ok: false, error: "Couldn't find that conference." };
  }

  const db = createAdminClient();
  const bucket = db.storage.from(PROGRAM_CRESTS_BUCKET);
  const path = `conferences/${conferenceId}/crest-${Date.now()}.${ext}`;

  const { error: uploadError } = await bucket.upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) {
    return {
      ok: false,
      error: `Couldn't upload the crest: ${uploadError.message}`,
    };
  }

  const { error } = await db
    .from("conferences")
    .update({ crest_path: path })
    .eq("id", conferenceId);
  if (error) {
    // The object is up but the row does not point at it. Take it back down.
    await bucket.remove([path]);
    return { ok: false, error: "Couldn't save the crest." };
  }

  if (ownsPath(conferenceId, current.path) && current.path !== path) {
    await bucket.remove([current.path]);
  }

  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Back to the initials. Row first, then the object it pointed at. */
export async function adminRemoveConferenceCrest(
  conferenceId: string,
): Promise<CrestOutcome> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: NOT_AUTHORIZED };
  if (!UUID.test(conferenceId)) {
    return { ok: false, error: "No conference named." };
  }

  const current = await currentCrestPath(conferenceId);
  if (!current.ok) {
    return { ok: false, error: "Couldn't find that conference." };
  }
  if (!current.path) return { ok: true };

  const db = createAdminClient();
  const { error } = await db
    .from("conferences")
    .update({ crest_path: null })
    .eq("id", conferenceId);
  if (error) return { ok: false, error: "Couldn't remove the crest." };

  if (ownsPath(conferenceId, current.path)) {
    await db.storage.from(PROGRAM_CRESTS_BUCKET).remove([current.path]);
  }

  revalidatePath("/admin", "layout");
  return { ok: true };
}
