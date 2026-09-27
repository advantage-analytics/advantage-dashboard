// /design-sync stand-in for `next/link`.
//
// Two shipped pieces (WidgetCard, CardEmpty) render a Next `<Link>`. Bundled
// outside Next, the real one drags the App Router's client internals along
// and throws `process is not defined` at load, which takes every other
// export on the window global down with it. Claude Design has no router, so
// a plain anchor that keeps the visual contract is the truthful render.
// Wired through the generated tsconfig's `paths` (see build-pkg.mjs); the
// app itself never sees this file.
//
// Both scoped call sites pass only a string `href` (never Next's object
// form) plus `className`/`children`, so the shim's surface matches that
// rather than reproducing next/link's full prop set. A future scoped file
// that needs the object href or the router-only props (prefetch, replace,
// scroll, …) should extend this — or stay out of scope, per NOTES.md.
import * as React from "react";

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement>;

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { children, ...rest },
  ref,
) {
  return (
    <a ref={ref} {...rest}>
      {children}
    </a>
  );
});

export default Link;
