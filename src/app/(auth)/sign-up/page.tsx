import { SignUpForm } from "@/components/auth/sign-up-form";
import { safeNext } from "@/lib/auth/safe-next";
import { joinProgramNameForNext } from "@/lib/services/programs/join-state-server";

export const metadata = { title: "Create account" };

/**
 * Reads `?next=` once and clamps it before the form ever sees it — the same
 * shape as `/login`, and for the same reason.
 *
 * A join link sends a signed-out visitor here to make an account, and `next`
 * is how the confirmation mail brings them back to `/join/<token>` instead of
 * leaving a brand-new account on the dashboard, not on the team it was made
 * to join. When `next` is a join link the form's header names the team; any
 * other destination renders the ordinary form with no extra read.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { next: raw } = await searchParams;
  const next = safeNext(typeof raw === "string" ? raw : null);
  const joinProgram = await joinProgramNameForNext(next);
  return <SignUpForm next={next} joinProgram={joinProgram} />;
}
