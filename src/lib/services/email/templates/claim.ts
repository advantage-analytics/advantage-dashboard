import { siteUrl } from "@/lib/site-url";
import { renderEmail, renderText, type EmailContent } from "../shell";
import type { EmailMessage } from "../send";

/**
 * The four emails a program claim produces.
 *
 * None of them is preference-driven, and none carries a "turn this off" line.
 * Each is the direct consequence of something a person did — claiming a
 * program, or being the recorded contact for one somebody else claimed — and
 * an account-level notice with an unsubscribe link is one people switch off
 * and then miss.
 *
 * The state machine behind them is in `services/programs/claim-state.ts`. Two
 * details from it shape the copy and are easy to get wrong:
 *
 *  1. A claim that clears review lands in `objection_window`, not `approved`,
 *     and **a program in `objection_window` is fully usable**. So the "you're
 *     in" email fires at that transition and must not tell anyone to wait.
 *  2. `approved` is the quiet settle at the end of the window. It needs no
 *     email of its own — nothing changes for the coach, who has been working
 *     in the program the whole time.
 */

export interface ClaimVerifyAddressInput {
  /** The school address being proven — the only inbox this link is any use in. */
  to: string;
  programName: string;
  /** The login address of the signed-in account that started the claim. */
  accountEmail: string;
  /** The raw verification token. Exists here and nowhere else — the database keeps only its hash. */
  token: string;
}

/**
 * The mailbox gate for a claim started while SIGNED IN.
 *
 * A signed-out claimant proves the school address by signing in as it (the
 * Supabase magic link). A signed-in coach keeps the account they already have,
 * so the proof is this link instead: opening it — in a session belonging to
 * the account named below — is what finishes the setup. The copy therefore
 * has to carry two facts a reader might not expect: the program will NOT live
 * on this school address, and the link does nothing in anyone else's hands.
 */
export function claimVerifyAddressEmail(
  input: ClaimVerifyAddressInput
): EmailMessage {
  const { to, programName, accountEmail, token } = input;

  const content: EmailContent = {
    preheader: `One click confirms your school address — ${programName} stays on your existing account.`,
    eyebrow: "Confirm your address",
    heading: `Confirm this address for ${programName}`,
    body: [
      `You asked to set up ${programName} on Advantage Analytics while signed in as ${accountEmail}. Opening the link below confirms you can receive mail at this address — that's the whole check.`,
      "The program stays on the account you're signed in with. This address is only how we tie you to the school.",
    ],
    facts: [
      { label: "Program", value: programName },
      { label: "Managed by", value: accountEmail },
    ],
    cta: {
      label: "Confirm and finish setup",
      url: `${siteUrl()}/claim/verify?token=${encodeURIComponent(token)}`,
    },
    note: `The link lasts 24 hours, works once, and only finishes setup for ${accountEmail} — forwarded on, it does nothing. Didn't ask for this? Ignore it; nothing happens without you.`,
  };

  return {
    to,
    subject: `Confirm your address for ${programName}`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "claim_verify_address" },
  };
}

export interface ClaimApprovedInput {
  to: string;
  programName: string;
  /** Job title from the setup form — "Head coach", "Director of tennis". */
  claimantTitle: string;
  /** When the objection window closes, already formatted. */
  windowClosesOn: string;
}

export function claimApprovedEmail(input: ClaimApprovedInput): EmailMessage {
  const { to, programName, claimantTitle, windowClosesOn } = input;

  const content: EmailContent = {
    preheader: `${programName} is set up and ready to use.`,
    eyebrow: "Program claimed",
    heading: `${programName} is yours`,
    body: [
      `You're set up as ${claimantTitle} for ${programName}. The workspace is open now — invite your staff and players, and start sending matches.`,
      "Nothing is pending and nothing is waiting on us.",
    ],
    facts: [
      { label: "Program", value: programName },
      { label: "You are", value: claimantTitle },
    ],
    cta: { label: "Open your team", url: `${siteUrl()}/dashboard/team` },
    // Said plainly rather than hidden. The window is real, someone at the
    // school can still contest it, and a coach who first hears about that when
    // a colleague objects has been kept in the dark by omission.
    //
    // It does NOT say we told the program's contacts, because we don't: the
    // announced claim — mail to every scraped contact whenever a program was
    // claimed — was cut before launch (see the /admin/claims header), and
    // `claimObjectionNoticeEmail` below has no caller. An email that claims a
    // notice nobody received is worse than one that stays quiet about it.
    note: `Someone at the program can still contest this. If nobody raises a concern by ${windowClosesOn}, the claim settles for good — there's nothing for you to do either way.`,
  };

  return {
    to,
    subject: `${programName} is ready`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "claim_approved" },
  };
}

export interface ClaimDeclinedInput {
  to: string;
  programName: string;
  /** The reviewer's note, where they left one. */
  reason: string | null;
  /** Key for the program page, so the alternative route is one click. */
  programKey: string;
}

export function claimDeclinedEmail(input: ClaimDeclinedInput): EmailMessage {
  const { to, programName, reason, programKey } = input;

  const content: EmailContent = {
    preheader: `We couldn't approve your claim to ${programName}.`,
    eyebrow: "Claim not approved",
    heading: `We couldn't approve your claim to ${programName}`,
    body: [
      // No apology and no euphemism. The most likely reason by far is an
      // address we could not tie to the school, which is a fixable thing
      // rather than a judgement about the person.
      "This usually means we couldn't confirm the address you used belongs to the program. It isn't a judgement about whether you coach there.",
      "If someone from your program already runs the workspace, asking them for an invite is the fastest way in — it takes them one click.",
    ],
    facts: [
      { label: "Program", value: programName },
      ...(reason ? [{ label: "Reviewer's note", value: reason }] : []),
    ],
    cta: {
      label: "Request an invite instead",
      url: `${siteUrl()}/claim/${encodeURIComponent(programKey)}/request`,
    },
    note: "If you think this is wrong, reply to this email — a person reads it, and a claim can be reopened.",
  };

  return {
    to,
    subject: `Your claim to ${programName}`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "claim_declined" },
  };
}

export interface ClaimObjectionNoticeInput {
  /** A contact recorded against the program, not the claimant. */
  to: string;
  programName: string;
  claimantName: string;
  /** Masked at the call site if it should be — this template prints it as given. */
  claimantEmail: string;
  claimantTitle: string;
  windowClosesOn: string;
  programKey: string;
}

/**
 * "Somebody claimed your program."
 *
 * The one email here that goes to a person who never signed up for anything,
 * which sets its tone: it explains itself completely, asks for nothing unless
 * something is wrong, and never implies wrongdoing by the claimant. In the
 * overwhelming majority of cases the recipient knows exactly who this is.
 */
export function claimObjectionNoticeEmail(
  input: ClaimObjectionNoticeInput
): EmailMessage {
  const {
    to,
    programName,
    claimantName,
    claimantEmail,
    claimantTitle,
    windowClosesOn,
    programKey,
  } = input;

  const content: EmailContent = {
    preheader: `${claimantName} now manages ${programName} on Advantage.`,
    eyebrow: "For your awareness",
    heading: `${claimantName} claimed ${programName}`,
    body: [
      `You're listed as a contact for ${programName}, so we're letting you know that ${claimantName} has set it up on Advantage Analytics — a match analysis tool for collegiate programs.`,
      "If that's expected, there's nothing to do. This email is the only one you'll get about it.",
      `If it isn't, tell us before ${windowClosesOn} and we'll pause the account while we sort it out.`,
    ],
    facts: [
      { label: "Program", value: programName },
      { label: "Claimed by", value: `${claimantName} (${claimantEmail})` },
      { label: "Claimed as", value: claimantTitle },
    ],
    cta: {
      label: "This isn't right",
      url: `${siteUrl()}/claim/${encodeURIComponent(programKey)}/object`,
    },
    note: "You're getting this because your address is on file as a contact for this program. We don't add contacts to any mailing list.",
  };

  return {
    to,
    // Deliberately not alarming. "Action required" on a message that needs no
    // action from nine recipients in ten is how a real warning gets ignored.
    subject: `${programName} was claimed on Advantage`,
    html: renderEmail(content),
    text: renderText(content),
    tags: { type: "claim_objection_notice" },
  };
}
