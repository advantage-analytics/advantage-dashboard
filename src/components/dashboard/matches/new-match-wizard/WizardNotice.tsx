import { TriangleAlert } from "lucide-react";
import { noteIconCls, warningStripCls } from "./styles";

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
 */
export function WizardNotice({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" className={warningStripCls}>
      <TriangleAlert
        className={noteIconCls}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}
