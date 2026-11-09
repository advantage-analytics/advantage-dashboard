/**
 * A stretched link: its `::after` covers the nearest positioned ancestor (the
 * row, which takes `relative`), so the hit area is exactly the row's wash. The
 * focus ring moves onto that box — put `data-focus-ring="none"` on the element
 * so `focus.css` does not also ring the text — and focus draws the whole row.
 *
 * Lives here, not in a component file, because both Server and Client
 * Components use it: a string exported from a `"use client"` module reaches a
 * Server Component as a client reference, not as the string.
 */
export const STRETCHED =
  "after:absolute after:inset-0 after:rounded-[var(--radius-element)] after:content-[''] focus-visible:after:[box-shadow:var(--focus-ring)]";
