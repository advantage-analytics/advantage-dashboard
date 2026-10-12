import { expect } from "@playwright/test";

/** Small readers for `renderToStaticMarkup` output. */

/** The opening tag carrying `attr`. */
export function tag(html: string, attr: string): string {
  const at = html.indexOf(attr);
  expect(at, attr).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
}

/** The inner text of the element carrying `attr`. */
export function inner(html: string, attr: string): string {
  const at = html.indexOf(attr);
  expect(at, attr).toBeGreaterThan(-1);
  const start = html.indexOf(">", at) + 1;
  return html.slice(start, html.indexOf("<", start));
}

/** The words a reader sees: tags out, entities back, whitespace collapsed. */
export function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function count(html: string, pattern: RegExp): number {
  return html.match(pattern)?.length ?? 0;
}
