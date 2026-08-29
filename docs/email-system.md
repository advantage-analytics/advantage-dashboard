# Transactional email

**Status:** current as of 2026-08-24. Every claim below was verified against the
tree at `splitstep-integration` @ `f871bd5`.
**Read alongside:** the doc comment on [`src/lib/services/email/index.ts`](../src/lib/services/email/index.ts) — it is the authoritative list of which emails exist and what fires each one. Update it there; this doc does not duplicate it.

How this application sends mail, what a new email has to look like, and the rules
that are not style preferences.

**Adding an email? Go to §4.** §5 is the list of ways a send fails silently —
read it before you wire a trigger. The rest is background for someone changing
the shell.

---

## 1. Two senders, on purpose

| | **Product mail** | **Auth mail** |
|---|---|---|
| Examples | Program invite, analysis ready, weekly digest, claim outcomes | Confirm your address, reset password, magic link |
| Lives in | `src/lib/services/email/` | `supabase/email-templates/*.html` |
| Rendered by | `shell.ts` → `renderEmail()` | Supabase's own template engine, `{{ .ConfirmationURL }}` placeholders |
| Sent by | `sendEmail()` → Resend REST API | Supabase, over the project's SMTP |

This split is deliberate and should stay. Routing auth mail through our sender
means owning delivery for password resets, and a password reset that does not
arrive is an account nobody can get back into.

**The cost of the split:** `shell.ts` is a hand-copy of the auth markup. Both must
keep looking like one company — product mail that looks unlike auth mail reads as
a phishing attempt — and nothing enforces that. There is no runtime import that
could; a build-time check comparing the colours, font stack and dark-mode block
across the two would catch real divergence, and has not been written.

**Four copies of one visual language.** On the auth side:
[`scripts/build_email_templates.py`](../scripts/build_email_templates.py) → the
six `.html` files → what is uploaded to Supabase. `shell.ts` is the fourth, off
to the side. Only the first arrow is automated.

> ⚠️ **The generator and its output have already diverged.** The committed
> `.html` files carry the `@font-face` block in its own Outlook-hidden `<style>`;
> `build_email_templates.py:65` still emits an `@import` of the Google Fonts CSS
> inside the main block — the exact failure `shell.ts` warns about. Someone
> hand-patched the generated files and never ported it back. **Re-running the
> generator today reverts that fix in all six templates.** Port the fix into the
> script before you next run it, and add the equivalent of
> `tests/generate-map.spec.ts` (run generator, assert no diff) so it cannot
> happen again.

> Naming trap: `supabase/email-templates/invite.html` is **Supabase Auth's**
> invite, not the program invite. The program invite is
> [`templates/program-invite.ts`](../src/lib/services/email/templates/program-invite.ts).

---

## 2. The module

Import from `@/lib/services/email` — the index — never from the files underneath.
The split between sender, shell and template is an implementation detail, and a
caller reaching past it is how a second sender eventually appears.

| File | Role |
|---|---|
| `index.ts` | The public surface, and the list of what exists |
| `send.ts` | `sendEmail()`. The only place this app sends mail from |
| `shell.ts` | `renderEmail()` / `renderText()` / `preferenceNote()`. The HTML every product email renders into |
| `config.ts` | Addresses, endpoints, timeout. No inlining these at call sites |
| `templates/*.ts` | One function per email, grouped by family — `claim.ts` holds three, `analysis.ts` two |

---

## 3. The content model

A template never writes HTML. It builds an `EmailContent` (`shell.ts`) and hands
it to `renderEmail()`. Every field is escaped on the way in, so user-supplied
program and player names are safe by construction — and unsafe the moment someone
bypasses the shell.

| Field | Required | Notes for the author |
|---|---|---|
| `preheader` | **yes** | The grey line beside the subject in the inbox |
| `eyebrow` | **yes** | Upper-cased for you — don't shout in the string |
| `heading` | **yes** | Also becomes the `<title>` |
| `body` | **yes** | One paragraph per array entry |
| `facts` | no | Label/value pairs in a quiet panel. Short values, not sentences |
| `list` + `listTitle` | no | Repeating rows: primary, secondary, optional right-aligned `trailing` |
| `cta` | no | **One** button. The shell renders a single CTA, plus a paste-this-link fallback |
| `note` | no | Small print under the CTA — expiry, what to do if unexpected |

Block order is fixed by `renderEmail()` and is not a per-template decision:

```
preheader (hidden) → wordmark → eyebrow → heading → body¶ → facts
  → list → CTA + paste-link → note → support divider → © line (outside the card)
```

`EmailRow` is three fields and stays three: a fourth column stops fitting a 320px
phone.

---

## 4. Adding an email — the checklist

1. **Write `templates/<name>.ts`** exporting `<name>Email(input): EmailMessage`,
   or add it to the family file it belongs with. Take a typed input interface —
   a `Date` or a number, not a pre-formatted string.
2. **Build an `EmailContent`** (§3). Never hand-write HTML.
3. **Return all four parts:**
   ```ts
   return {
     to,
     subject,
     html: renderEmail(content),
     text: renderText(content),   // always — see §5
     tags: { type: "<snake_case>" },
   };
   ```
4. **Export it from `index.ts`** and add a row to the table in its doc comment.
   That table is the only record of what fires each email.
5. **Call it from a server action or route handler**, after the row it announces
   is already written, and handle `{ ok: false }`.
6. **If a Settings switch drives it**, gate the send on the preference and append
   `preferenceNote("<the switch's exact label>")` to the `note`.

---

## 5. Rules that are not style preferences

Each of these exists because of a specific failure:

- **Always set `preheader`.** Left empty, the client scrapes the first text in
  the document — which is the eyebrow. Every invite ever sent would preview as
  "INVITATION".
- **Always send `text`.** Spam filters score an HTML-only multipart worse than one
  carrying both. An invite in junk is an invite that never sent.
- **`sendEmail()` is server-only.** `RESEND_API_KEY` is unprefixed, so in the
  browser it is `undefined` and the send silently takes the "no key" branch,
  printing to a console nobody reads. That failure looks exactly like success.
  Server actions live in files clients import from — check where you are calling
  from. (With the key unset locally, printing instead of sending is the intended
  default.)
- **Send after the durable write, never before.** The invite row exists whether or
  not the mail goes out; the resend path is what recovers a failed send.
- **Don't wrap `sendEmail()`.** It already checks Resend's suppression list before
  sending — Resend otherwise accepts a suppressed recipient, returns an id, then
  drops the message — bounds itself to `SEND_TIMEOUT_MS`, and never throws. A
  retry loop or a `try`/`catch` around it is a misunderstanding of all three.
  The suppression check **fails open** on purpose — a 429 or 5xx from the
  suppression endpoint returns "not suppressed" and the send proceeds. It exists
  to make a silent drop visible, not to become a new reason mail cannot leave.
- **`tags` are ASCII letters, numbers, underscores and dashes only.** Anything
  else and Resend rejects the whole message.
- **Format dates in UTC.** Expiries are compared against `now()` in Postgres.
  Local-zone formatting prints a date the database disagrees with by up to a day —
  and the day it disagrees is the day someone's link dies early.
- **Build links with `siteUrl()`** from `@/lib/site-url`. It deliberately allows
  localhost: in development the person clicking is at the machine serving it.
  Never derive an email link's origin from the request's `Host` header — an
  attacker who can set `Host` gets invitation links pointing at their own host,
  and the recipient hands over a valid token by clicking something that looks
  legitimate. Email links come from configuration.

---

## 6. The visual language

Advantage Design System v2, inlined — Gmail strips `<style>` from forwarded mail,
so nothing can be imported. The colour values are not repeated here, because a prose copy
is the one nothing renders and therefore the one that goes stale invisibly:

- **Colours, light and dark:** the `@media (prefers-color-scheme: dark)` block in
  `shell.ts`, and the token block at the top of `build_email_templates.py`, which
  cites its design-system provenance. Source of truth for both is
  `src/styles/design-system/`.
- **One rule worth knowing before you "fix" it:** the filled CTA keeps `#3B82F6`
  in dark mode. The lifted blue used for links would drop white text below 3:1.

Composition, which belongs to the shell rather than the token file: Inter 300/400/500
only; heading 24px/32px weight 300; body 15px/26px; small print and labels 12px/20px;
eyebrow 10px with 2.5px tracking; card inset 44px, dropping to 28px under 600px.

---

## 7. Why the markup looks like 2004

Nested tables, inline styles, VML, and a font block that sits alone at the end.
Every one is load-bearing — Outlook renders through Word, Gmail strips and
discards. **Do not modernise them.** The reasoning is on the `shell.ts` header
comment, beside the markup it explains; read it there before changing anything in
that file.

---

## 8. Written but not yet wired

Inherited from the pilot branch (merged in PR #131), each waiting on one call
site or one decision:

- **`analysisReadyEmail` / `analysisFailedEmail`** exist and nothing sends them.
  The call belongs at the point a job becomes readable — the derivation publish
  step on `splitstep-derivation`. The guards are already in place:
  `user_preferences` treats absent rows as defaults (ready on, failed on,
  digest off), and `sendEmail()` checks suppression. The templates take a
  `statsPending` flag — with derivation's `timeline` status, that flag is what
  distinguishes "your report is ready" from "processing finished, numbers to
  follow".
- **`teamDigestEmail` + `digestIsWorthSending`** exist and nothing schedules
  them. Needs a Monday cron — and Vercel crons run in Production only.
- **A separate sending subdomain.** `advantage-analytics.com` currently sends
  both cold outreach to college staff and transactional pilot invitations, and
  the suppression list already holds ~20 `.edu` addresses from the outreach.
  Complaints against outreach damage the reputation the invitations depend on —
  the one email that must arrive rides on the sender most likely to be marked
  spam. The split is a Resend domain add, three DNS records, and one line in
  `email/config.ts`.

---

## Appendix — previewing a template without booting the app

`npx tsx` resolves the `@/` alias, so a template renders directly — the same
invocation the other `scripts/*.ts` in this repo document. `tsx` is not a
dependency here, so the first run downloads it.

Put the file in `scripts/` and write the output outside the repo. Both matter:
`tsconfig.json` includes `**/*.ts` with no exclusion for the root, so a scratch
file left anywhere in the tree joins `npx tsc --noEmit` and `npm run lint` — and
a stray `preview.html` at the root is one `git add -A` away from being committed.

```ts
// scripts/preview-email.ts — delete when done, or keep it and commit it
import { writeFileSync } from "node:fs";
import { programInviteEmail } from "@/lib/services/email";

const msg = programInviteEmail({
  to: "jordan@example.edu",
  programName: "Stanford Men's Tennis",
  inviterName: "Alex Rivera",
  role: "coach",
  token: "sample",
  expiresAt: new Date("2026-09-05T00:00:00Z"),
});

writeFileSync("/tmp/preview.html", msg.html);
console.log(msg.subject, "\n\n", msg.text);
```

```bash
NEXT_PUBLIC_SITE_URL=https://app.advantage-analytics.com npx tsx scripts/preview-email.ts
```

Open `/tmp/preview.html` in a browser for layout, and read the text part
separately — it is half of what sends. Neither substitutes for a real client
test: Outlook and Gmail are the two that break, and only a real send shows you
that.
