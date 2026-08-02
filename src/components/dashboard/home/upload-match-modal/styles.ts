/**
 * Shared className strings for the upload-match-modal subtree.
 *
 * Every value below is a literal copy of a token documented in
 * `.skills/advantage-analytics-design/SKILL.md`. The mapping is recorded so
 * future palette work can be done by editing SKILL.md + a single grep, not by
 * hunting nine files.
 */

/**
 * Primary blue CTA — modal footer "Continue" / "Create" and the in-zone "Browse files" button.
 *
 * Source: SKILL.md › Component Patterns › Button (Primary, CTA)
 *   bg-accent / bg-accent-hover / radius-button / shadow `[0_1px_3px_rgba(57,134,243,0.25)]`
 *   plus the project-standard disabled treatment from SKILL.md › Interaction States › Disabled
 *   (bg-[#F7F7F7], text-muted #888888).
 */
export const primaryBtnCls =
  "h-9 px-4 rounded-[6px] text-[13px] font-medium bg-[#3B82F6] hover:bg-[#2563EB] text-white shadow-[0_1px_3px_rgba(57,134,243,0.25)] transition-colors duration-200 disabled:bg-[#F7F7F7] disabled:text-[#888888] disabled:shadow-none";

/**
 * Quiet ghost CTA — secondary actions paired with a primary (e.g. Confirm step's "Edit").
 *
 * Source: SKILL.md › Component Patterns › Button (Ghost), with the `h-9 px-4 rounded-[6px]`
 * sizing borrowed from Button (Primary, CTA) so the two read as a paired system in the footer.
 * Tokens: border-field #EAECF0, text-secondary #525252, bg-subtle #F5F5F5 hover.
 */
export const ghostBtnCls =
  "h-9 px-4 rounded-[6px] text-[13px] font-medium bg-white border border-[#EAECF0] text-[#525252] hover:bg-[#F5F5F5] shadow-none transition-colors duration-200";

/**
 * 10px uppercase tracked label — section headings, field labels, eyebrow metadata.
 *
 * Source: SKILL.md › Typography › Type Scale › `label`
 *   text-[10px] font-medium uppercase tracking-[2.5px], color text-label #AAAAAA.
 */
export const eyebrowLabelCls =
  "text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]";

/**
 * Focus ring shared by every interactive element in the modal.
 *
 * Source: SKILL.md › Interaction States › Focus
 *   focus-visible:ring-2 ring-accent/40, no outline.
 */
export const focusRingCls =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40";

/**
 * Chrome icon button — back/close/remove/nudge affordances.
 *
 * Source: SKILL.md › Component Patterns › Chrome Icon Button
 *   h-7 w-7 rounded-lg, text-muted #888888 → text-primary on hover, bg-subtle
 *   #F5F5F5 hover. SKILL.md's pairing rule requires every icon button in a
 *   dismissible surface to share size, shape, hover and focus, so this exists
 *   to stop the modal shipping two different-looking remove buttons.
 *
 * Pass `size` for the compact variant used inside dense control rows. Sizes are
 * spelled out rather than interpolated — Tailwind scans source text, so a
 * constructed `h-${n}` class never gets generated.
 */
const ICON_BTN_SIZE = {
  6: "h-6 w-6",
  7: "h-7 w-7",
} as const;

const iconBtnBase =
  `rounded-lg flex items-center justify-center text-[#888888] hover:bg-[#F5F5F5] transition-colors duration-200 ${focusRingCls}`;

export function iconBtnCls(size: 6 | 7 = 7): string {
  return `${ICON_BTN_SIZE[size]} ${iconBtnBase} hover:text-[#0D0D0D]`;
}

/** Destructive variant of {@link iconBtnCls} — remove/delete affordances. */
export function dangerIconBtnCls(size: 6 | 7 = 7): string {
  return `${ICON_BTN_SIZE[size]} ${iconBtnBase} hover:text-[#E51837]`;
}

/**
 * Dashed drop zone surface. Shared by the file and video pick steps so their
 * idle / drag-over / busy states cannot drift apart.
 */
export function dropZoneCls(busy: boolean, isOver: boolean): string {
  if (busy) return "bg-[#FAFAFA] border-[#F3F3F3]";
  if (isOver) return "bg-[#EFF4FF] border-[#3B82F6]";
  return "bg-[#FAFAFA] border-[#F3F3F3] hover:bg-[#EFF4FF] hover:border-[#3B82F6]/40";
}
