import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * The link in Supabase's auth mail (`supabase/email-templates/*.html`).
 *
 * GoTrue never leaves `.RedirectTo` empty: with no valid `redirect_to` it is
 * the Referer, then the Site URL. A template that tests `{{ if .RedirectTo }}`
 * and appends `&token_hash=…` therefore mails
 * `https://app.advantage-analytics.com&token_hash=…` — not a host — whenever
 * the send did not come from the app. A confirmation resent from the Supabase
 * dashboard did exactly that on 2026-10-03. What this pins: every link is
 * either the static `{{ .SiteURL }}/confirm?…` form or `$link`, and `$link` is
 * only pointed at `.RedirectTo` behind the query-string check.
 */

const DIR = join(__dirname, "..", "supabase", "email-templates");
const templates = readdirSync(DIR)
  .filter((f) => f.endsWith(".html"))
  .map((f) => [f, readFileSync(join(DIR, f), "utf8")] as const);

const STATIC =
  /^\{\{ \.SiteURL \}\}\/confirm\?token_hash=\{\{ \.TokenHash \}\}&type=\w+&next=\/[\w/-]+$/;

for (const [file, html] of templates) {
  test(`${file}: links are static or $link`, () => {
    const links = [
      ...html.matchAll(/href="([^"]*)"/g),
      ...html.matchAll(/class="accent"[^>]*>([^<]*)</g),
    ]
      .map((m) => m[1])
      .filter((l) => l.includes("{{"));
    for (const link of links) {
      expect(link === "{{ $link }}" || STATIC.test(link), link).toBe(true);
    }
    expect(html).not.toContain("{{ if .RedirectTo }}");
  });
}

for (const [file, type] of [
  ["confirmation.html", "email"],
  ["magic_link.html", "magiclink"],
] as const) {
  test(`${file}: .RedirectTo is used only when it carries a query string`, () => {
    const html = templates.find(([f]) => f === file)![1];
    expect(html.startsWith("{{- /*")).toBe(true);
    expect(html).toContain(
      `{{- $link := print .SiteURL "/confirm?token_hash=" .TokenHash "&type=${type}&next=/dashboard" -}}`,
    );
    expect(html).toContain(
      `{{- range $i := len .RedirectTo }}{{ if eq (index $.RedirectTo $i) 63 }}` +
        `{{ $link = print $.RedirectTo "&token_hash=" $.TokenHash "&type=${type}" }}{{ end }}{{ end -}}`,
    );
    // VML href, button href, fallback href, fallback text.
    expect(html.split("{{ $link }}").length - 1).toBe(4);
    // Nothing but the guarded assignment reads it.
    expect(html.split(".RedirectTo").length - 1).toBe(4);
  });
}
