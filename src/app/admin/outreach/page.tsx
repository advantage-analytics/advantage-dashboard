import { OutreachPageContent } from "@/components/admin/outreach-page-content";
import {
  loadPrograms,
  loadRecipients,
  loadSends,
  loadTemplates,
} from "@/lib/services/outreach/outreach-server";
import {
  OUTREACH_EMAILS,
  type OutreachProgram,
} from "@/lib/services/outreach/types";
import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin › Outreach — the beta launch emails, recipient by recipient.
 *
 * `force-dynamic` for the same reason as the other admin pages: the render is
 * gated on the current session's `is_admin`.
 *
 * `maxDuration` because a tranche is one server action that sends one email
 * every ~0.6 s, so forty programs take most of a minute. Server actions take
 * this page's segment config.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const metadata = { title: "Outreach" };

function one(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ? first.trim() : null;
}

export default async function AdminOutreachPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminOrNotFound();
  const params = await searchParams;

  const emailParam = Number(one(params.email));
  const emailNo = OUTREACH_EMAILS.some((email) => email.no === emailParam)
    ? emailParam
    : 7;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let setupError: string | null = null;
  let recipients: Awaited<ReturnType<typeof loadRecipients>> = [];
  let sends: Awaited<ReturnType<typeof loadSends>> = [];
  let programs: OutreachProgram[] = [];
  let customized: number[] = [];
  try {
    const [loadedRecipients, loadedSends, templates] = await Promise.all([
      loadRecipients(),
      loadSends(),
      loadTemplates(),
    ]);
    recipients = loadedRecipients;
    sends = loadedSends;
    customized = [...templates.keys()];
    // Only the programs the lists point at; the client needs nothing else.
    programs = await loadPrograms(
      recipients.flatMap((recipient) => recipient.programKeys),
    );
  } catch (error) {
    // Before the migrations run there are no tables to read. Say so instead of
    // throwing the whole admin area into its error boundary.
    setupError = (error as Error).message;
  }

  return (
    <OutreachPageContent
      initialEmailNo={emailNo}
      recipients={recipients}
      sends={sends}
      programs={programs}
      customizedEmails={customized}
      adminEmail={user?.email ?? ""}
      postalSet={Boolean(process.env.OUTREACH_POSTAL_ADDRESS?.trim())}
      resendSet={Boolean(process.env.RESEND_API_KEY?.trim())}
      setupError={setupError}
    />
  );
}
