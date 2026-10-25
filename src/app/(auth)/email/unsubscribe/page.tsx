import type { ReactNode } from "react";
import FormHeader from "@/components/auth/form-header";
import AuthButton from "@/components/auth/auth-button";
import AuthFooter from "@/components/auth/auth-footer";
import { unsubscribeForm } from "./actions";

export const metadata = { title: "Unsubscribe" };

/**
 * Where the unsubscribe link in a getting-started email lands.
 *
 * The GET does nothing but render a button, for the same reason `/confirm`
 * does: mail scanners and link previews fetch every link in a message, and an
 * unsubscribe on GET would turn people's mail off without them. The button
 * posts `unsubscribeForm`, which checks the signed link and turns "Tips for
 * getting started" off. Mail clients' own one-click unsubscribe goes to
 * `/api/email/unsubscribe` instead.
 *
 * Works signed out. The link carries its own authority.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (name: string) =>
    typeof params[name] === "string" ? (params[name] as string) : null;
  const status = one("status");

  if (status === "done") {
    return (
      <Panel>
        <FormHeader
          eyebrow="Email preferences"
          title="You're Unsubscribed."
          description="We won't send you getting-started tips again. Emails about your own matches and account still arrive, and you can change either in Settings › Preferences."
        />
      </Panel>
    );
  }

  const userId = one("u");
  const token = one("t");
  const broken = status === "invalid" || !userId || !token;

  if (broken) {
    return (
      <Panel>
        <FormHeader
          eyebrow="Email preferences"
          title="This Link Doesn't Work."
          description="It may have been cut short when it was copied. Sign in and turn off Tips for getting started in Settings › Preferences, or reply to the email and we'll do it for you."
        />
      </Panel>
    );
  }

  return (
    <Panel>
      <FormHeader
        eyebrow="Email preferences"
        title="Stop Getting-Started Tips?"
        description={
          status === "failed"
            ? "That didn't save. Please try again."
            : "We'll stop the emails about adding your first match. Emails about your own matches and account still arrive."
        }
      />
      <form action={unsubscribeForm} className="flex flex-col gap-[16px]">
        <input type="hidden" name="u" value={userId} />
        <input type="hidden" name="t" value={token} />
        <AuthButton type="submit">Unsubscribe</AuthButton>
        <AuthFooter>
          <span className="text-micro">
            Changed your mind? Close the page. Nothing changes unless you press
            Unsubscribe.
          </span>
        </AuthFooter>
      </form>
    </Panel>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex w-full max-w-[360px] flex-col gap-[24px]"
      style={{ animation: "fadeUp 0.5s ease-out" }}
    >
      {children}
    </div>
  );
}
