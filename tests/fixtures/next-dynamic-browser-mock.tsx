import { lazy, Suspense, type ComponentType } from "react";

/**
 * `next/dynamic` for a plain webpack bundle.
 *
 * The real module reaches into Next's shared runtime for preloading and the
 * App Router's streaming; a browser harness has neither and only needs the one
 * behaviour the film tab depends on — the fullscreen room is not in the first
 * chunk and mounts when it is asked for. `React.lazy` is exactly that.
 */
export default function dynamic<P extends object>(
  loader: () => Promise<ComponentType<P>>,
): ComponentType<P> {
  const Loaded = lazy(async () => ({ default: await loader() }));
  return function Dynamic(props: P) {
    return (
      <Suspense fallback={null}>
        <Loaded {...props} />
      </Suspense>
    );
  };
}
