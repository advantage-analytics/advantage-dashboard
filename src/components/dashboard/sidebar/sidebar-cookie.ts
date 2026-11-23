/**
 * The width this browser is actually showing, mirrored into a cookie so the
 * server can render it. `localStorage` keeps the preference; the cookie keeps
 * what was on screen — on a laptop that auto-collapses the panel it says
 * collapsed, so that reload does not draw a panel it is about to close.
 */
// Its own module, not `sidebar-state.tsx`: that file is a client module, and
// the dashboard layout (a Server Component) needs the plain string.
export const SIDEBAR_COOKIE = "sidebar_expanded";
