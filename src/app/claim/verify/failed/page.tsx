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
const COPY: Record<
  ClaimFailure,
  { heading: string; sub: string; restart: boolean }
> = {
  "no-session": {
    heading: "Open the link from your email",
    sub: "This page finishes a claim, and it needs the link we sent you. Any device works — the link carries everything.",
    restart: false,
  },
  "no-pending": {
    heading: "There's nothing waiting for this address",
    sub: "The link signed you in, but we have no program setup in progress for you — usually because it was already finished, or more than a day passed. Pick the program again and we'll send a fresh link.",
    restart: true,
  },
  expired: {
    heading: "That link has expired",
    sub: "Links last a day. Nothing was created, so picking the program again starts cleanly.",
    restart: true,
  },
  "unknown-program": {
    heading: "We couldn't find that program",
    sub: "The program you picked is no longer in the directory. If it should be, tell us and we'll add it.",
    restart: true,
  },
  taken: {
    heading: "Someone finished this first",
    sub: "Another person completed the setup for this program while your link was open. If that wasn't someone on your staff, you can tell us.",
    restart: false,
  },
  failed: {
    heading: "We couldn't finish setting this up",
    sub: "Something went wrong on our side. Nothing was created — opening the link again is safe.",
    restart: false,
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
      {copy.restart ? (
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
