/**
 * A fixed name for a control, so its click reads as "wizard_continue" in
 * analytics instead of "a button".
 *
 * Autocapture runs with all text and all element attributes masked
 * (instrumentation-client.ts), which is right for a product whose screens
 * hold athletes' names — and leaves every click anonymous. posthog-js reads
 * `data-ph-capture-attribute-*` separately from the attributes that setting
 * masks and puts each on the click event as a property, so this one comes
 * through as `control`.
 *
 * The name is written here in the source and never derived from what the
 * control shows: a snake_case word for what it does, never a label that
 * could carry a player, a team or a file.
 *
 * Spread it onto the element: `<button {...controlName("wizard_continue")}>`.
 */
export function controlName(name: string): {
  "data-ph-capture-attribute-control": string;
} {
  return { "data-ph-capture-attribute-control": name };
}
