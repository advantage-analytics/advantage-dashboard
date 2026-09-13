import type { SupabaseClient } from "@supabase/supabase-js";
import { USER_AVATARS_BUCKET } from "@/lib/user/avatar";

/**
 * Photo URLs for the people on a program, keyed by login id.
 *
 * `users` RLS is own-row only, so the key has to come through
 * `program_member_avatars`, which answers only a member of that program. The
 * bucket is public, so the URL is a pure function of the key — no signing, no
 * second round trip. A person with no photo, or a failed read, is simply
 * absent: every caller falls back to initials, which is the correct drawing
 * for "no photo" and a harmless one for "couldn't tell".
 */
export async function getMemberAvatarUrls(
  supabase: SupabaseClient,
  programId: string,
): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc("program_member_avatars", {
    p_program_id: programId,
  });

  if (error) {
    console.error("[avatars] could not read member avatars", {
      programId,
      error: error.message,
    });
    return new Map();
  }

  const bucket = supabase.storage.from(USER_AVATARS_BUCKET);
  return new Map(
    ((data ?? []) as { user_id: string; avatar_path: string }[]).map((row) => [
      row.user_id,
      bucket.getPublicUrl(row.avatar_path).data.publicUrl,
    ]),
  );
}
