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
