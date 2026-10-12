import { SignUpSuccess } from "@/components/auth/sign-up-success";
import { safeNext } from "@/lib/auth/safe-next";
import { joinTokenFromPath } from "@/lib/services/programs/join-links";
import { joinProgramNameForNext } from "@/lib/services/programs/join-state-server";

export const metadata = { title: "Account created" };

/**
 * Reads `?next=` so the screen can say where the confirmation mail leads.
 *
 * `SignUpForm` forwards its destination here. For an ordinary sign-up there is
 * none and this renders the screen it always did. For one that began on a join
 * link, "You've Joined the Team" would be false — the account exists, the
 * membership does not yet — so the client component swaps the title and the
 * last step, and its links back into auth keep the same `next`.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { next: raw } = await searchParams;
  const next = safeNext(typeof raw === "string" ? raw : null);
  const joining = joinTokenFromPath(next) !== null;
  const joinProgram = joining ? await joinProgramNameForNext(next) : null;

  return (
    <SignUpSuccess next={next} joining={joining} joinProgram={joinProgram} />
  );
}
