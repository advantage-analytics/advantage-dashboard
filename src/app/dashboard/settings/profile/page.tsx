import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import {
  ProfileForm,
  type ProfileDraft,
} from "@/components/dashboard/settings/profile-form";

const EMPTY_DRAFT: ProfileDraft = {
  firstName: "",
  lastName: "",
  birthdate: "",
  phone: "",
  country: "",
  state: "",
  hand: "",
  backhand: "",
  role: "",
};

/**
 * Reads the row on the server and hands the form its opening state.
 *
 * Same shape as Preferences and Team next door. The page used to be a client
 * component that fetched `users` in an effect, which meant an empty form and a
 * "7 fields left" badge on first paint, plus a `loaded` flag to hide them.
 */
export default async function ProfilePage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) return <ProfileForm initial={EMPTY_DRAFT} />;

  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("first_name, last_name, dob, phone, country, state, hand, backhand, role")
    .eq("id", workspace.viewer.id)
    .maybeSingle();

  return (
    <ProfileForm
      initial={
        data
          ? {
              firstName: data.first_name ?? "",
              lastName: data.last_name ?? "",
              birthdate: data.dob ?? "",
              phone: data.phone ?? "",
              country: data.country ?? "",
              state: data.state ?? "",
              hand: data.hand ?? "",
              backhand: data.backhand ?? "",
              role: data.role ?? "",
            }
          : EMPTY_DRAFT
      }
    />
  );
}
