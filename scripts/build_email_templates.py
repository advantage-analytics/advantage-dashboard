#!/usr/bin/env python3
"""Generate Advantage Analytics transactional email templates (Supabase Auth).

Design tokens come from Advantage Design System v2 — DESIGN.md and
src/styles/design-system/{colors,effects}.css. The composition (600px card on
#FAFAFA, wordmark, uppercase eyebrow with no rule under it, light-300 headline,
44px inset, hairline-divided rows, one blue CTA, quiet footer outside the card)
is the same one the college-pilot outreach email uses, so the transactional mail
and the campaign mail read as one family.

Templates link into the app's email-confirm route at `/confirm` (NOT
`/auth/confirm` — `(auth)` is a Next.js route group, so it adds no path
segment) using the token_hash OTP flow the route is built for:

    {{ .SiteURL }}/confirm?token_hash={{ .TokenHash }}&type=<TYPE>&next=<NEXT>

confirmation and magic_link instead use redirect_url(), which prefers the
app's emailRedirectTo — see that function for why, and for why recovery
must not follow.

Outputs:
  - supabase/email-templates/<kind>.html   (version-controlled source)
  - /tmp/email_templates_patch.json         (Supabase PATCH payload: subjects + content)
"""
import json
import os

# ---- Design tokens: v2 light ramp (src/styles/design-system/colors.css) ----
INK_900 = "#0D0D0D"   # headings
INK_700 = "#525252"   # body copy
INK_600 = "#71717A"   # muted-but-readable — the AA floor for small print
INK_400 = "#AAAAAA"   # section labels, legal line
SURFACE_PAGE = "#FAFAFA"
SURFACE_CARD = "#FFFFFF"
SURFACE_SUBTLE = "#F5F5F5"  # tinted insets (the code panel)
HAIRLINE = "#F3F3F3"
BLUE = "#3B82F6"
BLUE_HOVER = "#2563EB"
SHADOW_CARD = "0px 2px 8px 0px rgba(0,0,0,0.06)"   # rest elevation
CTA_GLOW = "0 1px 3px rgba(57,134,243,0.25)"

# ---- v2 dark ramp. Email can't read .dark, so these are inlined in the
# ---- prefers-color-scheme block rather than pulled from the token file.
D_PAGE, D_CARD, D_SUBTLE = "#0A0A0B", "#0E0E10", "#1A1A1C"
D_HAIRLINE, D_BORDER = "#1F1F1F", "#2E2E2E"
D_INK_900, D_INK_700, D_INK_600, D_INK_400 = "#F5F5F5", "#B5B5B5", "#9A9A9A", "#828282"
D_BLUE = "#60A5FA"

SANS = ("'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,"
        "Helvetica,Arial,sans-serif")
# Machine values only, per v2. Roboto Mono won't load in mail clients; the
# stack degrades to whatever mono the OS has, which is the point.
MONO = "'Roboto Mono','SF Mono',SFMono-Regular,Menlo,Consolas,monospace"

# Hosted on the marketing site, not {{ .SiteURL }} — Site URL is the app origin
# and points at localhost in dev, which would break the logo in every test send.
# PNG not SVG: Gmail, Outlook and Yahoo all strip SVG. 280x50 served at 140x25.
WORDMARK = "https://advantage-analytics.com/email/advantage-wordmark.png"
WORDMARK_DARK = "https://advantage-analytics.com/email/advantage-wordmark-white.png"

SUPPORT_EMAIL = "team@advantage-analytics.com"
YEAR = 2026

STYLE = f"""
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
    body {{ margin:0; padding:0; width:100% !important; background:{SURFACE_PAGE};
      -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;
      -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; }}
    table {{ border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }}
    img {{ border:0; line-height:100%; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }}
    a {{ text-decoration:none; }}
    .btn:hover {{ background:{BLUE_HOVER} !important; }}
    @media only screen and (max-width:600px) {{
      .container {{ width:100% !important; }}
      .px {{ padding-left:28px !important; padding-right:28px !important; }}
      .h1 {{ font-size:22px !important; line-height:30px !important; }}
      /* The code has to shrink or the digits wrap out of the panel. */
      .code {{ font-size:26px !important; letter-spacing:6px !important; }}
    }}
    @media (prefers-color-scheme: dark) {{
      .bg {{ background:{D_PAGE} !important; }}
      .card {{ background:{D_CARD} !important; border-color:{D_BORDER} !important; box-shadow:none !important; }}
      .ink {{ color:{D_INK_900} !important; }}
      .ink2 {{ color:{D_INK_700} !important; }}
      .ink3 {{ color:{D_INK_600} !important; }}
      .ink4 {{ color:{D_INK_400} !important; }}
      .rule {{ border-color:{D_HAIRLINE} !important; }}
      .tone {{ background:{D_SUBTLE} !important; }}
      .accent {{ color:{D_BLUE} !important; }}
      /* The filled CTA keeps #3B82F6 — white text on the lifted dark blue
         would drop below 3:1. Only unfilled blue lifts. */
      .logo-light {{ display:none !important; }}
      .logo-dark {{ display:inline-block !important; width:140px !important; max-height:none !important; }}
    }}
"""


def shell(title, preheader, eyebrow, heading, blocks):
    """The card. `blocks` are complete <tr> rows slotted under the headline."""
    return f"""<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>{title} — Advantage</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>{STYLE}</style>
</head>
<body class="bg" style="margin:0; padding:0; background:{SURFACE_PAGE};">
  <span style="display:none !important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all;">{preheader}</span>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="bg" style="background:{SURFACE_PAGE};">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="width:600px; max-width:600px;">

          <tr>
            <td class="card" style="background:{SURFACE_CARD}; border:1px solid {HAIRLINE}; border-radius:14px; box-shadow:{SHADOW_CARD};">

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="px" style="padding:44px 44px 0 44px;">
                    <img class="logo-light" src="{WORDMARK}" width="140" height="25" alt="Advantage" style="display:block; width:140px; height:auto; border:0; outline:none;">
                    <img class="logo-dark" src="{WORDMARK_DARK}" width="140" height="25" alt="Advantage" style="display:none; width:0; max-height:0; overflow:hidden; border:0; outline:none;">
                  </td>
                </tr>

                <!-- v2 retired the rule under eyebrows; whitespace separates. -->
                <tr>
                  <td class="px" style="padding:36px 44px 0 44px;">
                    <p class="ink4" style="margin:0 0 12px 0; font-family:{SANS}; font-size:10px; font-weight:500; letter-spacing:2.5px; color:{INK_400};">{eyebrow}</p>
                    <h1 class="h1 ink" style="margin:0; font-family:{SANS}; font-size:24px; line-height:32px; font-weight:300; letter-spacing:-0.5px; color:{INK_900};">{heading}</h1>
                  </td>
                </tr>
{blocks}
                <tr>
                  <td class="px" style="padding:36px 44px 44px 44px;">
                    <div class="rule" style="border-top:1px solid {HAIRLINE}; padding-top:24px;">
                      <p class="ink3" style="margin:0; font-family:{SANS}; font-size:12px; line-height:20px; color:{INK_600};">Need help? Reach us at <a class="accent" href="mailto:{SUPPORT_EMAIL}" style="color:{BLUE};">{SUPPORT_EMAIL}</a>.</p>
                    </div>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <tr>
            <td align="center" style="padding:24px 40px 8px 40px;">
              <p class="ink4" style="margin:0; font-family:{SANS}; font-size:11px; line-height:17px; color:{INK_400};">&copy; {YEAR} Advantage Analytics LLC &middot; advantage-analytics.com</p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>
"""


def para(text):
    return f"""
                <tr>
                  <td class="px" style="padding:20px 44px 0 44px;">
                    <p class="ink2" style="margin:0; font-family:{SANS}; font-size:15px; line-height:26px; color:{INK_700};">{text}</p>
                  </td>
                </tr>
"""


def button(label, url, vml_width):
    """VML for Outlook's Word engine, table+anchor for everything else.
    vml_width must clear the label — Outlook clips, it doesn't grow."""
    return f"""
                <tr>
                  <td class="px" style="padding:28px 44px 0 44px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{url}" style="height:45px;v-text-anchor:middle;width:{vml_width}px;" arcsize="13%" strokecolor="{BLUE}" fillcolor="{BLUE}">
                    <w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:500;">{label}</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td class="btn" bgcolor="{BLUE}" align="center" style="border-radius:6px; box-shadow:{CTA_GLOW};">
                          <a href="{url}" target="_blank" style="display:block; padding:14px 30px; font-family:{SANS}; font-size:14px; font-weight:500; letter-spacing:0.5px; color:#FFFFFF; border-radius:6px; white-space:nowrap;">{label}</a>
                        </td>
                      </tr>
                    </table>
                    <!--<![endif]-->
                  </td>
                </tr>
"""


def fallback(url):
    return f"""
                <tr>
                  <td class="px" style="padding:26px 44px 0 44px;">
                    <p class="ink3" style="margin:0 0 6px 0; font-family:{SANS}; font-size:12px; line-height:20px; color:{INK_600};">If the button doesn't work, paste this link into your browser:</p>
                    <p style="margin:0; font-family:{SANS}; font-size:12px; line-height:20px; word-break:break-all;"><a class="accent" href="{url}" style="color:{BLUE};">{url}</a></p>
                  </td>
                </tr>
"""


def note(text):
    return f"""
                <tr>
                  <td class="px" style="padding:20px 44px 0 44px;">
                    <p class="ink3" style="margin:0; font-family:{SANS}; font-size:12px; line-height:20px; color:{INK_600};">{text}</p>
                  </td>
                </tr>
"""


def hairline():
    return f"""
                <tr>
                  <td class="px" style="padding:26px 44px 0 44px;">
                    <div class="rule" style="border-top:1px solid {HAIRLINE}; font-size:0; line-height:0;">&nbsp;</div>
                  </td>
                </tr>
"""


def detail_row(label, value, emphasis=False):
    colour, cls = (INK_900, "ink") if emphasis else (INK_700, "ink2")
    return f"""
                <tr>
                  <td class="px" style="padding:18px 44px 0 44px;">
                    <p class="ink4" style="margin:0 0 4px 0; font-family:{SANS}; font-size:10px; font-weight:500; letter-spacing:2.5px; color:{INK_400};">{label}</p>
                    <p class="{cls}" style="margin:0; font-family:{SANS}; font-size:14px; line-height:22px; color:{colour}; word-break:break-all;">{value}</p>
                  </td>
                </tr>
"""


def inner_hairline():
    return f"""
                <tr>
                  <td class="px" style="padding:18px 44px 0 44px;">
                    <div class="rule" style="border-top:1px solid {HAIRLINE}; font-size:0; line-height:0;">&nbsp;</div>
                  </td>
                </tr>
"""


def code_panel(token):
    """A tinted inset, not a bordered panel — v2 forbids nested cards."""
    return f"""
                <tr>
                  <td class="px" style="padding:26px 44px 0 44px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="tone" style="background:{SURFACE_SUBTLE}; border-radius:8px;">
                      <tr>
                        <td align="center" style="padding:22px 20px;">
                          <!-- padding-left offsets the trailing letter-space, which
                               otherwise parks the code 4px left of true centre. -->
                          <div class="code ink" style="padding-left:8px; font-family:{MONO}; font-size:30px; font-weight:500; letter-spacing:8px; line-height:38px; color:{INK_900}; mso-line-height-rule:exactly;">{token}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
"""


def confirm_url(type_, next_):
    """Static link into the app's /confirm route via the configured Site URL."""
    return "{{ .SiteURL }}/confirm?token_hash={{ .TokenHash }}&type=%s&next=%s" % (type_, next_)


def redirect_url(type_, next_):
    """Honour the app's emailRedirectTo, falling back to the static link.

    {{ .SiteURL }} is the project's *configured* Site URL — always production —
    so a hardcoded link throws emailRedirectTo away and drops the user at
    `next` no matter where the flow started. That broke the program-claim
    flow, which has to land on /claim/verify rather than /dashboard.

    The `&` is load-bearing: RedirectTo already carries a query string. Any
    template whose caller sends a bare path (recovery does) must keep using
    confirm_url — this would give it `/update-password&token_hash=...`.
    """
    return ("{{ if .RedirectTo }}{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=%s"
            "{{ else }}%s{{ end }}" % (type_, confirm_url(type_, next_)))


def link_body(intro, cta, vml_width, url, expiry, ignore):
    return "".join([
        para(intro),
        button(cta, url, vml_width),
        fallback(url),
        note(f"{expiry} {ignore}"),
    ])


# ---- Per-template definitions ----
# Eyebrows are section labels, not restatements of the headline — "CONFIRM
# YOUR EMAIL" over "Confirm your email address" reads as a stutter.
TEMPLATES = {
  "confirmation": dict(
    subject="Confirm your email · Advantage Analytics",
    title="Confirm your email", eyebrow="ACCOUNT SETUP",
    preheader="Confirm your email address to finish setting up your Advantage Analytics account.",
    heading="Confirm your email address",
    body=link_body(
      "Welcome to Advantage Analytics. Confirm your email to get started — Advantage Intelligence now takes your match video and turns it into court-level performance insight. SwingVision exports work too.",
      "Confirm email", 170, redirect_url("email", "/dashboard"),
      "This link expires in 24 hours.",
      "If you didn't create an Advantage Analytics account, you can safely ignore this email.")),
  "invite": dict(
    subject="You're invited to Advantage",
    title="You're invited", eyebrow="INVITATION",
    preheader="Accept your invitation to Advantage and set up your account.",
    heading="You've been invited to Advantage",
    body=link_body(
      "You've been invited to join Advantage. Accept your invitation to set up your account and start analyzing your matches.",
      "Accept invitation", 195, confirm_url("invite", "/update-password"),
      "This invitation expires in 24 hours.",
      "If you weren't expecting this invite, you can safely ignore this email.")),
  "magic_link": dict(
    subject="Your sign-in link · Advantage Analytics",
    title="Sign in", eyebrow="SIGN IN",
    preheader="Your sign-in link for Advantage Analytics. No password needed.",
    heading="Your sign-in link",
    body=link_body(
      "Use the button below to sign in to Advantage Analytics. No password needed.",
      "Sign in", 130, redirect_url("magiclink", "/dashboard"),
      "This link expires in 1 hour.",
      "If you didn't request this link, you can safely ignore this email.")),
  "recovery": dict(
    subject="Reset your password · Advantage Analytics",
    title="Reset your password", eyebrow="ACCOUNT SECURITY",
    preheader="Choose a new password for your Advantage Analytics account.",
    heading="Reset your password",
    body=link_body(
      "We received a request to reset your Advantage Analytics password. Choose a new one with the button below.",
      "Reset password", 180, confirm_url("recovery", "/update-password"),
      "This link expires in 1 hour.",
      "If you didn't request a reset, you can safely ignore this email — your password won't change.")),
  "email_change": dict(
    subject="Confirm your new email · Advantage Analytics",
    title="Confirm email change", eyebrow="ACCOUNT SETTINGS",
    preheader="Confirm your new address to finish updating the email on your account.",
    heading="Confirm your new email",
    body="".join([
      para("Confirm this address to finish updating the email on your Advantage Analytics account."),
      # The two addresses carry more weight as hairline rows than as prose.
      hairline(),
      detail_row("CURRENT", "{{ .Email }}"),
      inner_hairline(),
      detail_row("NEW", "{{ .NewEmail }}", emphasis=True),
      inner_hairline(),
      button("Confirm email change",
             confirm_url("email_change", "/dashboard/settings/account"), 215),
      fallback(confirm_url("email_change", "/dashboard/settings/account")),
      note("This link expires in 24 hours. If you didn't request this change, contact us right away."),
    ])),
  "reauthentication": dict(
    subject="Your verification code · Advantage Analytics",
    title="Verification code", eyebrow="SECURITY CHECK",
    preheader="Your Advantage Analytics verification code.",
    heading="Your verification code",
    body="".join([
      para("Enter this code to confirm it's you and continue."),
      code_panel("{{ .Token }}"),
      note("This code expires in 1 hour. If you didn't request it, you can safely ignore this email."),
    ])),
}


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(root, "supabase", "email-templates")
    os.makedirs(out_dir, exist_ok=True)
    patch = {}
    for kind, t in TEMPLATES.items():
        html = shell(t["title"], t["preheader"], t["eyebrow"], t["heading"], t["body"])
        with open(os.path.join(out_dir, f"{kind}.html"), "w") as f:
            f.write(html)
        patch[f"mailer_subjects_{kind}"] = t["subject"]
        patch[f"mailer_templates_{kind}_content"] = html
    with open("/tmp/email_templates_patch.json", "w") as f:
        json.dump(patch, f)
    print(f"Wrote {len(TEMPLATES)} templates to {out_dir}")
    for kind in TEMPLATES:
        print(f"  - {kind}.html ({len(TEMPLATES[kind]['body'])} body chars)")


if __name__ == "__main__":
    main()
