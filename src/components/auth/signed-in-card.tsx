"use client";

import { useEffect, useState, type ReactNode } from "react";
import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";
import { isPostHogConfigured } from "@/lib/posthog-client";
import { safeNext } from "@/lib/auth/safe-next";
import { getInitials } from "@/lib/data/match-utils";
import { PersonAvatar } from "@/components/ui/person-avatar";
import FormHeader from "./form-header";
import { ErrorText } from "./form-error";
import AuthButton from "./auth-button";
import AuthFooter, { AUTH_LINK } from "./auth-footer";

/** Which auth page the card stands in for: it only changes the copy. */
export type SignedInMode = "login" | "sign-up";

/** The account the browser is signed in as. `name` is null when none is on file. */
export interface SignedInAccount {
  name: string | null;
  email: string;
}

const COPY: Record<SignedInMode, { eyebrow: string; description: string }> = {
  login: {
    eyebrow: "Sign in",
    description:
      "Carry on where you left off, or sign out to use a different account.",
  },
  "sign-up": {
    eyebrow: "Create account",
    description:
      "Carry on with this account, or sign out first if you meant to make a separate one.",
  },
};

/**
 * What `/login` and `/sign-up` draw for a visitor who is already signed in.
 *
 * Without it, someone arriving from a bookmark or the marketing site's
 * "Sign in" saw the ordinary form, picked a different Google account and
 * made a second Advantage account without noticing (2026-11, the case
 * behind this). The card names the account they are in and makes carrying
 * on the primary action; switching is the quiet way out.
 *
 * Switching signs out on this device only (`scope: "local"`, as
 * `SwitchAccountButton` does) — never the person's other sessions — then
 * reloads the same address, query string and all, so the form that comes
 * back still carries its `next`.
 */
export function SignedInCard({
  mode,
  account,
  next,
}: {
  mode: SignedInMode;
  account: SignedInAccount;
  /** The page's `?next=`, clamped again here: Continue goes there. */
  next?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const copy = COPY[mode];
  const destination = safeNext(next ?? null);
  const label = account.name ?? account.email;

  const switchAccount = async () => {
    setBusy(true);
    setFailed(false);
    // auth-js reports a failed sign-out by returning `error`, not throwing,
    // and leaves the session in place — reloading then would only draw this
    // card again, so a failure stays here and says so.
    const { error } = await createClient()
      .auth.signOut({ scope: "local" })
      .catch((caught: unknown) => ({ error: caught }));
    if (error) {
      setBusy(false);
      setFailed(true);
      return;
    }
    // As every other sign-out does: the next account's activity must not be
    // filed under this one's person.
    if (isPostHogConfigured) posthog.reset();
    // A full load: every cached route belongs to the session that just
    // ended, and the same address (query string included) re-reads the
    // session to draw the form.
    window.location.reload();
  };

  return (
    <div
      className="flex w-full max-w-[360px] flex-col gap-[24px]"
      style={{ animation: "fadeUp 0.5s ease-out" }}
    >
      <FormHeader
        eyebrow={copy.eyebrow}
        title="You're Already Signed In."
        description={copy.description}
      />

      <div
        data-testid="signed-in-account"
        className="flex items-center gap-[12px] rounded-[var(--radius-element)] bg-[var(--surface-page)] px-[16px] py-[14px]"
      >
        <PersonAvatar
          initials={getInitials(label)}
          className="size-[36px] text-[12px]"
        />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
            {label}
          </span>
          {account.name && (
            <span className="text-body-sm truncate">{account.email}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-[16px]">
        <AuthButton href={destination}>Continue to Advantage</AuthButton>

        <AuthFooter>
          <span className="text-body-sm">
            Not you?{" "}
            <button
              type="button"
              onClick={switchAccount}
              disabled={busy}
              className={`${AUTH_LINK} disabled:opacity-50`}
            >
              Use a different account
            </button>
          </span>
          {failed ? (
            <ErrorText>Couldn&apos;t sign you out. Try again.</ErrorText>
          ) : (
            <span className="text-micro">
              Signs you out on this device only.
            </span>
          )}
        </AuthFooter>
      </div>
    </div>
  );
}

/**
 * Draws the page's form unless the browser holds a live session, in which
 * case it draws `SignedInCard` in its place.
 *
 * Read in the browser so the auth pages keep the first paint they have: the
 * form is server-rendered as before and stays up while the check runs, so a
 * signed-out visitor never sees anything but the form and never pays for a
 * network call — `getSession()` reads the cookie, and with no session the
 * check ends there. Only a found session is confirmed with `getUser()`: a
 * revoked one would otherwise show the card, Continue would bounce off the
 * dashboard's gate back to `/login`, and the card would show again.
 */
export function SignedInGate({
  mode,
  next,
  children,
}: {
  mode: SignedInMode;
  next?: string;
  children: ReactNode;
}) {
  // Null covers both "still checking" and "signed out": either way the form
  // is what shows, so the two need no separate state.
  const [account, setAccount] = useState<SignedInAccount | null>(null);

  useEffect(() => {
    let cancelled = false;
    readSignedInAccount()
      .then((found) => {
        if (!cancelled) setAccount(found);
      })
      // A failed check leaves the form up, as a signed-out visit does.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (account)
    return <SignedInCard mode={mode} account={account} next={next} />;
  return <>{children}</>;
}

async function readSignedInAccount(): Promise<SignedInAccount | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  // The profile read runs beside the confirmation rather than after it: it
  // needs only the id the cookie already holds, and RLS limits it to that
  // row. Its result is used only once `getUser()` confirms the session.
  // The profile's name is the one the dashboard shows; the identity
  // provider's stands in when the profile has none yet (a Google account
  // before onboarding).
  const [
    {
      data: { user },
    },
    { data: row },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("users")
      .select("first_name, last_name")
      .eq("id", session.user.id)
      .maybeSingle(),
  ]);
  if (!user?.email) return null;
  const profileName = [row?.first_name, row?.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  const meta = user.user_metadata ?? {};
  const providerName =
    typeof meta.full_name === "string"
      ? meta.full_name
      : typeof meta.name === "string"
        ? meta.name
        : "";
  const name = profileName || providerName.trim() || null;

  return { name, email: user.email };
}
