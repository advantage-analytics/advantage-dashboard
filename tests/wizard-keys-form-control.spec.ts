import { expect, test } from '@playwright/test';

import { isFormControl } from '@/components/dashboard/matches/new-match-wizard/useWizardKeys';

/**
 * `useWizardKeys` advances the wizard on a plain Enter unless the focused
 * element owns its own Enter — a field, a select, a combobox. The pure
 * predicate is what decides that, and this pins the case a native select
 * used to cover and a `MenuSelect` trigger silently did not: a closed popup
 * trigger must keep its Enter, or Enter on the dual builder's Site cell
 * opens nothing and jumps to the lineup step instead.
 *
 * The runtime here is Node, so an element is a minimal stand-in carrying the
 * three things the predicate reads.
 */
function el(tagName: string, attrs: Record<string, string> = {}, contentEditable = false) {
  return {
    tagName,
    isContentEditable: contentEditable,
    getAttribute: (name: string) => attrs[name] ?? null,
    hasAttribute: (name: string) => name in attrs,
  } as unknown as HTMLElement;
}

test.describe('isFormControl', () => {
  test('fields and native selects own their Enter', () => {
    expect(isFormControl(el('INPUT'))).toBe(true);
    expect(isFormControl(el('TEXTAREA'))).toBe(true);
    expect(isFormControl(el('SELECT'))).toBe(true);
    expect(isFormControl(el('DIV', {}, true))).toBe(true);
    expect(isFormControl(el('INPUT', { role: 'combobox' }))).toBe(true);
  });

  test('a closed popup trigger owns its Enter — MenuSelect is a button with aria-haspopup', () => {
    expect(isFormControl(el('BUTTON', { 'aria-haspopup': 'menu', 'aria-expanded': 'false' }))).toBe(true);
  });

  test('a plain button, link or nothing does not', () => {
    expect(isFormControl(el('BUTTON'))).toBe(false);
    expect(isFormControl(el('A', { href: '/x' }))).toBe(false);
    expect(isFormControl(null)).toBe(false);
  });
});
