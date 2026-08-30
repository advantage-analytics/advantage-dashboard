import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ClaimShell,
  AsidePanel,
} from "@/components/claim/claim-shell";
import { TeamSetupForm } from "@/components/claim/team-setup-form";
import type { CustomOrgType } from "@/lib/services/programs/create-actions";

export const metadata = { title: "Set up your team" };

/**
 * The org types `create_custom_program` accepts — the source of truth is
 * `CUSTOM_ORG_TYPES` in `create-actions.ts`. Mirrored here (not imported: that
 * const isn't exported) only to reject a tampered `?type=` before rendering.
 */
const VALID_TYPES = ["club", "high_school", "academy", "other"] as const;

function isCustomOrgType(value: string | undefined): value is CustomOrgType {
  return (VALID_TYPES as readonly string[]).includes(value ?? "");
}

/**
 * Screen 7.2 — you name it, you own it, no confirmation step.
 *
 * The org type arrives from 7.1 as `?type=`; a missing or tampered value falls
 * back to the type screen rather than guessing one. "Your name" is pre-filled
 * from the coach's profile so the field starts true and a correction persists
 * (see `createCustomTeam`).
 *
 * The "How this differs from a college team" aside rides in `ClaimShell`'s
 * right column. Its budget line is deliberately absent: `quotaTierFor()` gives
 * a self-serve custom org the individual figure, not the collegiate 75h, so the
 * design's "shared-hour budget" footnote would be a promise the code doesn't
 * keep. Back returns to 7.1; ✕ leaves setup per the Stage 7 chrome convention.
 */
export default async function TeamSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  if (!isCustomOrgType(type)) redirect("/claim/team/type");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();

  const defaultOwnerName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    <ClaimShell
      width={1000}
      gap={16}
      back="/claim/team/type"
      asideWidth={340}
      aside={
        <AsidePanel
          title="How this differs from a college team"
          items={[
            "No school to find and no address to confirm",
            "You're the owner the moment you create it",
            "Sending video works right away — nothing is held",
          ]}
          footnote="Pilot pricing applies."
        />
      }
    >
      <TeamSetupForm orgType={type} defaultOwnerName={defaultOwnerName} />
    </ClaimShell>
  );
}
