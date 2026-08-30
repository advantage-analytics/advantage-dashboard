import Link from "next/link";
import type { ClaimFailure } from "@/lib/services/programs/claim-actions";
import {
  ClaimShell,
  ClaimHeading,
  ClaimActions,
  CLAIM_BUTTON,
  CLAIM_LINK,
  CLAIM_MICRO,
} from "@/components/claim/claim-shell";

export const metadata = { title: "We couldn't finish this" };

/**
 * The one screen a claim can fail onto.
 *
 * The copy lives here rather than travelling in the URL. `/claim/verify`
 * redirects with a code, and anything not in this map falls through to the
 * generic case — so a hand-edited `?reason=` renders our wording or nothing,
 * never the sender's.
 */
/**
 * Which action layout a screen shows. Mutually exclusive by construction — a
 * single discriminant rather than parallel booleans, so a new ending is a new
 * case, never a fourth flag to keep from overlapping.
 *
 * `exit` — the claim is over (or someone else finished it): go to the account.
 * `restart` — nothing was created: pick the program again for a fresh link.
 * `signIn` — the signed-in link needs the right session first.
 */
type FailAction = "exit" | "restart" | "signIn";

const COPY: Record<
  ClaimFailure,
  { heading: string; sub: string; action: FailAction }
> = {
  "no-session": {
    heading: "Open the link from your email",
    sub: "This page finishes a claim, and it needs the link we sent you. Any device works — the link carries everything.",
    action: "exit",
  },
  "no-pending": {
    heading: "There's nothing waiting for this address",
    sub: "The link signed you in, but we have no program setup in progress for you — usually because it was already finished, or more than a day passed. Pick the program again and we'll send a fresh link.",
    action: "restart",
  },
  expired: {
    heading: "That link has expired",
    sub: "Links last a day. Nothing was created, so picking the program again starts cleanly.",
    action: "restart",
  },
  "unknown-program": {
    heading: "We couldn't find that program",
    sub: "The program you picked is no longer in the directory. If it should be, tell us and we'll add it.",
    action: "restart",
  },
  taken: {
    heading: "Someone finished this first",
    sub: "Another person completed the setup for this program while your link was open. If that wasn't someone on your staff, you can tell us.",
    action: "exit",
  },
  failed: {
    heading: "We couldn't finish setting this up",
    sub: "Something went wrong on our side. Nothing was created — opening the link again is safe.",
    action: "exit",
  },
  // The two endings only the signed-in link can reach. That link finishes a
  // setup started from an existing account, so it works solely in a session
  // belonging to that account — the email says so, and these two screens are
  // where the other arrangements land.
  "sign-in-first": {
    heading: "Sign in, then open the link again",
    sub: "This link finishes a setup you started while signed in, so it only works once you are. Sign in with that account — any device works — then open the link from your email again.",
    action: "signIn",
  },
  "wrong-account": {
    heading: "That link belongs to a different account",
    sub: "The setup this link finishes was started from another account. Sign in with the account that started it and open the link again — or start fresh from this one, and we'll send a link of its own.",
    action: "signIn",
  },
};

export default async function ClaimFailedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const copy = COPY[reason as ClaimFailure] ?? COPY.failed;

  return (
    <ClaimShell width={720} gap={20} back="/claim/program">
      <ClaimHeading gap={6} title={copy.heading} body={copy.sub} bodyMax="58ch" />
      {copy.action === "signIn" ? (
        <>
          <ClaimActions>
            <Link href="/login" className={CLAIM_BUTTON}>
              Sign in
            </Link>
            <Link href="/claim/program" className={CLAIM_LINK}>
              Choose a different program
            </Link>
          </ClaimActions>
          <span className={CLAIM_MICRO}>
            Once you&apos;re signed in with the right account, open the link from
            your email again to finish.
          </span>
        </>
      ) : copy.action === "restart" ? (
        <>
          <ClaimActions>
            <Link href="/claim/program" className={CLAIM_BUTTON}>
              Find your program again
            </Link>
          </ClaimActions>
          <span className={CLAIM_MICRO}>
            Nothing was created, and no one has been told anything. Picking the
            program again sends a fresh link.
          </span>
        </>
      ) : (
        <ClaimActions>
          <Link href="/dashboard" className={CLAIM_BUTTON}>
            Go to your account
          </Link>
          <Link href="/claim/program" className={CLAIM_LINK}>
            Choose a different program
          </Link>
        </ClaimActions>
      )}
    </ClaimShell>
  );
}
