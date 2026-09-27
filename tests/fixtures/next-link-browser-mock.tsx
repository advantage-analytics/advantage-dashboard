export default function Link({
  href,
  children,
  // Router-only props: meaningless to a plain anchor, and React warns when
  // they reach the DOM. `replace` is kept as a data attribute so a spec can
  // tell a history-replacing link from a pushing one.
  replace,
  prefetch: _prefetch,
  scroll: _scroll,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  replace?: boolean;
  prefetch?: boolean | null;
  scroll?: boolean;
}) {
  void _prefetch;
  void _scroll;
  return (
    <a href={href} data-replace={replace ? "" : undefined} {...props}>
      {children}
    </a>
  );
}
