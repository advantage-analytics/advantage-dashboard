/**
 * The tail of a season card's day-zero sentence ("… once one of Kim's matches
 * ___."): the page's match scope keeps no match, or nothing is analyzed yet.
 */
export function matchReadiness(scopeEmpty: boolean): string {
  return scopeEmpty ? "fits this scope" : "is analyzed";
}
