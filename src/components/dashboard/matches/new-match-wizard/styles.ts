/**
 * Shared className strings for the new-match-wizard subtree.
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
 * Focus treatment shared by every interactive element in the modal.
 *
 * The ring itself is NOT set here. `src/styles/design-system/focus.css` draws
 * it for every control in the wizard — buttons, links, the trim-handle sliders,
 * the score `<input>`s — and because `globals.css` imports that file outside any
 * `@layer` while Tailwind's utilities live in `@layer utilities`, a
 * `focus-visible:ring-*` utility here would be discarded before specificity was
 * ever consulted. This constant now carries only what the utility layer still
 * decides; change the ring by editing the token, not by adding a class back.
 */
export const focusRingCls = "focus-visible:outline-none";

/**
 * Destructive icon button — the remove affordances.
 *
 * Source: SKILL.md › Component Patterns › Chrome Icon Button, h-7 w-7 rounded-lg,
 * text-muted #888888 on a #F5F5F5 hover.
 */
export const dangerIconBtnCls =
  `h-7 w-7 rounded-lg flex items-center justify-center text-[#888888] hover:bg-[#F5F5F5] hover:text-[#E51837] transition-colors duration-200 ${focusRingCls}`;

/**
 * The note strip — one quiet sentence on a surface-subtle wash, 13px glyph
 * beside it. The wizard's register for "here is the honest thing about this":
 * what an export includes, that nothing is uploading yet, why a video was
 * refused. Design: Upload Wizard v5 · 2b, 3b.
 */
export const noteStripCls =
  "flex items-start gap-2 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3 py-2.5 text-[11px] leading-[1.6] text-[var(--ink-700)]";

/**
 * The float menu — EntitySelect grammar: radius 12, 6px padding, hairline,
 * dropdown shadow. Rows are 38px with an 8px radius and a surface-subtle
 * wash on hover; the current row keeps the wash and a Signal Blue check.
 * Design: Upload Wizard v5 — 2a, 6b, 10a, 11a, 11b, 11d.
 */
export const floatMenuCls =
  "rounded-[var(--radius-dropdown)] border-[var(--border-hairline)] bg-white p-1.5 shadow-[var(--shadow-dropdown)] flex flex-col";

export const floatMenuLabelCls = "px-2.5 pb-1 pt-1.5 text-[11px] text-[var(--ink-400)]";

export const floatMenuRowCls =
  "flex h-[38px] w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] px-2.5 text-left transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] focus-visible:outline-none focus-visible:bg-[var(--surface-subtle)]";

export const floatMenuDividerCls = "my-[5px] h-px bg-[var(--border-hairline)]";
