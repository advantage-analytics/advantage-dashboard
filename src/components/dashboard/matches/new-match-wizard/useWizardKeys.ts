"use client";

/**
 * useWizardKeys — the wizard's keyboard, lifted out of `UploadMatchFlow` so the
 * chrome (`WizardShell`) and the keys that drive it can be adopted together by
 * any step-by-step page. It owns no state: every decision it makes is handed
 * in, and `continueDisabled` is computed exactly where it always was.
 */

import { useEffect, type RefObject } from "react";

/**
 * Does this element own its own Enter key?
 *
 * Used by both the footer hint (which swaps to the chord while you are typing)
 * and the Enter handler (which must not submit out from under a form control).
 * One rule, because two shapes of it in one file is how they drift.
 */
export function isFormControl(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    node.isContentEditable ||
    node.getAttribute("role") === "combobox"
  );
}

export interface UseWizardKeysOptions {
  /** The step content's root — the ⌘/Ctrl+Enter focus walk stays inside it. */
  contentRef: RefObject<HTMLDivElement | null>;
  /** Whether Esc has a previous step to go to. False on the first step. */
  canGoBack: boolean;
  onBack: () => void;
  continueDisabled: boolean;
  onContinue: () => void;
}

// Keyboard:
//   • Plain Enter advances the wizard when focus is outside form controls
//     (so score-entry and dropdowns keep their native Enter semantics —
//     focus chain in DetailsContent, opening selects, etc.).
//   • ⌘/Ctrl+Enter advances *focus* to the next field — same idea as Tab,
//     but reachable without the user having to retrain pinkies. Submitting
//     the wizard is reserved for the explicit Continue button so a fast-typed
//     chord can never skip a missed field.
//   • Esc steps back when there's a previous step. On the first step it does
//     nothing: leaving is a deliberate click, not a stray keypress.
export function useWizardKeys({
  contentRef,
  canGoBack,
  onBack,
  continueDisabled,
  onContinue,
}: UseWizardKeysOptions): void {
  useEffect(() => {
    const focusNextField = () => {
      // Walk forward through the step content's tabbables. When the user runs
      // out of fields, fall through to the Continue button so the terminal
      // chord lands on submit instead of silently no-op'ing.
      const root = contentRef.current;
      if (!root) return;
      const list = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a, button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      const idx = list.indexOf(document.activeElement as HTMLElement);
      if (idx === -1) return;
      const inFieldNext = list[idx + 1];
      if (inFieldNext) {
        inFieldNext.focus();
        // Select text inputs so the next keystroke replaces, matching the
        // behavior of tabbing into a numeric score cell.
        if (
          inFieldNext instanceof HTMLInputElement &&
          /text|number|search|email|url/i.test(inFieldNext.type || "text")
        ) {
          inFieldNext.select();
        }
        return;
      }
      // Walked past the last field — hand focus to Continue with a one-shot
      // ring pulse so the chord-to-submit handoff isn't silent.
      const cta = document.querySelector<HTMLElement>('[data-wizard-continue]:not([disabled])');
      if (!cta) return;
      cta.focus();
      cta.classList.remove("animate-chord-pulse");
      // Force a reflow so re-adding the class restarts the animation if it
      // was already mid-flight from a prior chord press.
      void cta.offsetWidth;
      cta.classList.add("animate-chord-pulse");
      const onEnd = () => {
        cta.classList.remove("animate-chord-pulse");
        cta.removeEventListener("animationend", onEnd);
      };
      cta.addEventListener("animationend", onEnd);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Cheapest test first: this listener sees EVERY keystroke on the page, and
      // only two keys can do anything below. Scanning the document for open
      // popovers before this check meant paying two full-document
      // querySelectors per character typed into the score boxes.
      if (e.key !== "Escape" && e.key !== "Enter") return;

      // An open menu owns the keyboard, and this runs in the CAPTURE phase to
      // find out. Radix dismisses its popovers from a document-level listener,
      // which fires before a window-level one — so by the time a bubble-phase
      // handler saw the event, aria-expanded had already flipped back to false
      // and Escape popped the wizard step as well as the menu it was aimed at.
      // Capturing means the question "is something open?" is asked while the
      // answer is still true, and the menu still gets its Escape afterwards.
      const active = document.activeElement as HTMLElement | null;
      if (
        active?.tagName === "SELECT" ||
        document.querySelector('[aria-expanded="true"]')
      ) {
        return;
      }

      if (e.key === "Escape" && canGoBack) {
        e.preventDefault();
        e.stopPropagation();
        onBack();
        return;
      }
      if (e.key !== "Enter" || e.shiftKey || e.altKey) return;

      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        focusNextField();
        return;
      }

      if (isFormControl(e.target)) return;
      if (continueDisabled) return;
      e.preventDefault();
      onContinue();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [contentRef, continueDisabled, onContinue, canGoBack, onBack]);
}
