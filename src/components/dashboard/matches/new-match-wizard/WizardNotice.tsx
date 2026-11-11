import { Info, TriangleAlert } from "lucide-react";
import { noteIconCls, noteStripCls, warningStripCls } from "./styles";

/**
 * The wizard's warning register, announced.
 *
 * `role="status"` with a polite live region, because every notice built on this
 * appears after the person's attention has already moved on: an export
 * finishing its parse, an approval read coming back, a draft refusing to open
 * in the workspace they are standing in.
 *
 * One shell, because there were three — `FlowNotice` in `UploadMatchFlow`,
 * `EligibilityNotice`'s own chrome, and `ImportIdentityNotice`'s local
 * `Notice`. They were byte-identical apart from the icon's export name:
 * `AlertTriangle` is lucide's old alias for `TriangleAlert`, so the same glyph
 * was being imported under two names in one subtree. That is the drift copying
 * chrome produces — not a visual difference anyone would catch in review, just
 * two spellings that make a future restyle miss a file.
 *
 * Children lay out in a column with a 2-unit gap, so a notice carrying an
 * action row under its sentence needs no wrapper of its own.
 *
 * `tone="note"` is the grey register — a fact the person should know, not a
 * question to answer (the Practice notice under Context). Same shell, same
 * announcement; the strip and its glyph change together, so a grey strip
 * never carries the warning triangle (`tests/notice-strips.spec.ts`).
 */
export function WizardNotice({
  children,
  tone = "warning",
}: {
  children: React.ReactNode;
  tone?: "warning" | "note";
}) {
  const Glyph = tone === "note" ? Info : TriangleAlert;
  return (
    <div
      role="status"
      aria-live="polite"
      className={tone === "note" ? noteStripCls : warningStripCls}
    >
      <Glyph className={noteIconCls} strokeWidth={1.5} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}
