/**
 * What the auth form's fields hold at submit, read from the form itself.
 *
 * Not React state: Chrome can autofill before hydration, or without firing an
 * input event, so the dots are on screen while state is still empty and the
 * submit would send a blank email or password. Missing fields read as "".
 */
export function readFormFields<K extends string>(
  form: HTMLFormElement,
  names: readonly K[],
): Record<K, string> {
  const data = new FormData(form);
  return Object.fromEntries(
    names.map((name) => [name, String(data.get(name) ?? "")]),
  ) as Record<K, string>;
}
