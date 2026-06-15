#!/usr/bin/env python3
"""Generate Advantage Analytics transactional email templates (Supabase Auth).

Design tokens come from .skills/advantage-analytics-design/SKILL.md.
Each template links into the app's email-confirm route at `/confirm`
(NOT `/auth/confirm` — `(auth)` is a Next.js route group, so it adds no
path segment) using the token_hash OTP flow the route is built for:

    {{ .SiteURL }}/confirm?token_hash={{ .TokenHash }}&type=<TYPE>&next=<NEXT>

Outputs:
  - supabase/email-templates/<kind>.html   (version-controlled source)
  - /tmp/email_templates_patch.json         (Supabase PATCH payload: subjects + content)
"""
import json
import os

# ---- Design tokens (SKILL.md) ----
PAGE_BG = "#FAFAFA"
CARD_BG = "#FFFFFF"
BORDER = "#F3F3F3"
HEADING = "#0D0D0D"
BODY = "#525252"
MUTED = "#888888"
LABEL = "#AAAAAA"
ACCENT = "#3B82F6"
ACCENT_HOVER = "#2563EB"
FONT = ("'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, "
        "'Helvetica Neue', Arial, sans-serif")

SUPPORT_EMAIL = "team@advantage-analytics.com"
YEAR = 2026

STYLE = f"""
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
    body {{ margin:0; padding:0; background-color:{PAGE_BG};
      -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; }}
    img {{ border:0; line-height:100%; outline:none; text-decoration:none; }}
    a {{ color:{ACCENT}; }}
    .wrapper {{ width:100%; background-color:{PAGE_BG}; padding:40px 0; }}
    .container {{ max-width:600px; margin:0 auto; background-color:{CARD_BG};
      border:1px solid {BORDER}; border-radius:14px;
      box-shadow:0px 2px 8px 0px rgba(0,0,0,0.06); overflow:hidden; }}
    .px {{ padding-left:40px; padding-right:40px; }}
    .cta:hover {{ background-color:{ACCENT_HOVER} !important; }}
    @media only screen and (max-width:600px) {{
      .wrapper {{ padding:20px 0; }}
      .container {{ border-radius:0; border-left:none; border-right:none; }}
      .px {{ padding-left:24px !important; padding-right:24px !important; }}
      .cta {{ display:block !important; }}
    }}
"""

def shell(title, eyebrow, heading, body_html):
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light">
  <title>{title} — Advantage Analytics</title>
  <style>{STYLE}</style>
</head>
<body style="margin:0; padding:0; background-color:{PAGE_BG}; font-family:{FONT};">
  <div class="wrapper" style="width:100%; background-color:{PAGE_BG}; padding:40px 0;">
    <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0"
      style="max-width:600px; margin:0 auto; background-color:{CARD_BG}; border:1px solid {BORDER}; border-radius:14px; box-shadow:0px 2px 8px 0px rgba(0,0,0,0.06); overflow:hidden;">
      <tr><td class="px" style="padding:36px 40px 0;">
        <img src="{{{{ .SiteURL }}}}/logos/logo-email.png" alt="Advantage Analytics" width="150" height="27" style="display:block; border:0; height:auto;">
      </td></tr>
      <tr><td class="px" style="padding:28px 40px 0;">
        <div style="font-family:{FONT}; font-size:10px; font-weight:500; text-transform:uppercase; letter-spacing:2.5px; color:{LABEL};">{eyebrow}</div>
        <h1 style="margin:12px 0 0; font-family:{FONT}; font-size:22px; font-weight:400; letter-spacing:-0.4px; line-height:1.3; color:{HEADING};">{heading}</h1>
      </td></tr>
      <tr><td class="px" style="padding:20px 40px 8px;">
        {body_html}
      </td></tr>
      <tr><td class="px" style="padding:0 40px;">
        <div style="height:1px; background-color:{BORDER}; margin:32px 0 0;"></div>
      </td></tr>
      <tr><td class="px" style="padding:24px 40px 36px;">
        <p style="margin:0 0 6px; font-family:{FONT}; font-size:12px; line-height:1.6; color:{MUTED};">
          Need help? Reach us at <a href="mailto:{SUPPORT_EMAIL}" style="color:{ACCENT}; text-decoration:none;">{SUPPORT_EMAIL}</a>.
        </p>
        <p style="margin:0; font-family:{FONT}; font-size:11px; line-height:1.6; color:{LABEL};">
          © {YEAR} Advantage Analytics LLC. All rights reserved.
        </p>
      </td></tr>
    </table>
  </div>
</body>
</html>
"""

def para(text):
    return (f'<p style="margin:0 0 16px; font-family:{FONT}; font-size:14px; '
            f'line-height:1.65; color:{BODY};">{text}</p>')

def button(label, url):
    return f"""<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;">
          <tr><td>
            <a class="cta" href="{url}" target="_blank"
              style="display:inline-block; background-color:{ACCENT}; color:#ffffff !important; font-family:{FONT}; font-size:14px; font-weight:600; letter-spacing:0.2px; text-decoration:none; padding:14px 30px; border-radius:6px; box-shadow:0 1px 3px rgba(57,134,243,0.25);">{label}</a>
          </td></tr>
        </table>"""

def fallback(url):
    return (f'<p style="margin:20px 0 0; font-family:{FONT}; font-size:12px; line-height:1.6; color:{MUTED};">'
            f'If the button doesn\'t work, copy and paste this link into your browser:</p>'
            f'<p style="margin:8px 0 0; font-family:{FONT}; font-size:12px; line-height:1.5; word-break:break-all;">'
            f'<a href="{url}" style="color:{ACCENT}; text-decoration:none;">{url}</a></p>')

def note(text):
    return (f'<p style="margin:16px 0 0; font-family:{FONT}; font-size:12px; '
            f'line-height:1.6; color:{MUTED};">{text}</p>')

LINK = "{{ .SiteURL }}/confirm?token_hash={{ .TokenHash }}&type=%s&next=%s"

def link_body(intro, cta, type_, next_, expiry, ignore):
    url = LINK % (type_, next_)
    return "\n        ".join([
        para(intro),
        button(cta, url),
        fallback(url),
        note(f"{expiry} {ignore}"),
    ])

# ---- Per-template definitions ----
TEMPLATES = {
  "confirmation": dict(
    subject="Confirm your email · Advantage Analytics",
    title="Confirm your email", eyebrow="Confirm your email",
    heading="Confirm your email address",
    body=link_body(
      "Welcome to Advantage Analytics. Confirm your email to turn your SwingVision match data into court-level performance insight.",
      "Confirm email", "email", "/dashboard",
      "This link expires in 24 hours.",
      "If you didn't create an Advantage Analytics account, you can safely ignore this email.")),
  "invite": dict(
    subject="You're invited to Advantage Analytics",
    title="You're invited", eyebrow="You're invited",
    heading="You've been invited to Advantage Analytics",
    body=link_body(
      "You've been invited to join Advantage Analytics. Accept your invitation to set up your account and start analyzing your matches.",
      "Accept invitation", "invite", "/update-password",
      "This invitation expires in 24 hours.",
      "If you weren't expecting this invite, you can safely ignore this email.")),
  "magic_link": dict(
    subject="Your sign-in link · Advantage Analytics",
    title="Sign in", eyebrow="Sign in",
    heading="Your sign-in link",
    body=link_body(
      "Use the button below to sign in to Advantage Analytics. No password needed.",
      "Sign in", "magiclink", "/dashboard",
      "This link expires in 1 hour.",
      "If you didn't request this link, you can safely ignore this email.")),
  "recovery": dict(
    subject="Reset your password · Advantage Analytics",
    title="Reset your password", eyebrow="Password reset",
    heading="Reset your password",
    body=link_body(
      "We received a request to reset your Advantage Analytics password. Choose a new one with the button below.",
      "Reset password", "recovery", "/update-password",
      "This link expires in 1 hour.",
      "If you didn't request a reset, you can safely ignore this email — your password won't change.")),
  "email_change": dict(
    subject="Confirm your new email · Advantage Analytics",
    title="Confirm email change", eyebrow="Email change",
    heading="Confirm your new email",
    body=link_body(
      "Confirm this address to finish updating the email on your Advantage Analytics account. You're changing from {{ .Email }} to {{ .NewEmail }}.",
      "Confirm email change", "email_change", "/dashboard/settings/account",
      "This link expires in 24 hours.",
      "If you didn't request this change, contact us right away.")),
  "reauthentication": dict(
    subject="Your verification code · Advantage Analytics",
    title="Verification code", eyebrow="Verify it's you",
    heading="Your verification code",
    body="\n        ".join([
      para("Enter this code to confirm it's you and continue."),
      (f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;"><tr><td '
       f'style="background-color:{PAGE_BG}; border:1px solid {BORDER}; border-radius:8px; padding:16px 24px; '
       f'font-family:{FONT}; font-size:30px; font-weight:600; letter-spacing:8px; color:{HEADING}; font-variant-numeric:tabular-nums;">'
       '{{ .Token }}</td></tr></table>'),
      note("This code expires in 1 hour. If you didn't request it, you can safely ignore this email."),
    ])),
}

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(root, "supabase", "email-templates")
    os.makedirs(out_dir, exist_ok=True)
    patch = {}
    for kind, t in TEMPLATES.items():
        html = shell(t["title"], t["eyebrow"], t["heading"], t["body"])
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
