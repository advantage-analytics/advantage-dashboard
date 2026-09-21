"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  applyVizUpdate,
  focusTargetAfterViewChange,
  parseVizState,
  reconcileVizState,
  viewIdentityKey,
  vizStateQuery,
  type VizState,
} from "./viz-url";
import {
  courtTileDomId,
  supportsViewTransitions,
  VIZ_COURT_TRANSITION_NAME,
  VIZ_FOCUSED_HEADING_ID,
} from "./viz-court-transition";

interface VizStateContextValue {
  state: VizState;
  setState: (next: VizState | ((prev: VizState) => VizState)) => void;
  hrefFor: (next: VizState) => string;
  /**
   * F5: the `viewIdentityKey` (`viz-url.ts`) of the court a morph currently
   * in flight is landing ON — `null` outside a morph. The wall's tiles, the
   * focused view's own "Views" grid tiles, and `viz-focused.tsx`'s big court
   * each compare THEIR OWN `viewIdentityKey` against this to decide whether
   * THEY are this morph's destination, and if so render with
   * `view-transition-name: viz-court-shared` so the browser pairs them with
   * whatever `runCourtMorph` marked as the source.
   */
  morphTargetKey: string | null;
  /**
   * F5's ONE animation: run `setState(next)` as a native View Transition
   * that shared-element-morphs `sourceEl` (the DOM node the visitor
   * clicked, or the court they're leaving) into the destination that
   * matches `targetKey`. Falls straight through to a plain `setState(next)`
   * — no morph — when the visitor prefers reduced motion, the browser
   * doesn't support `document.startViewTransition`, or `sourceEl` wasn't
   * found (nothing to morph FROM). See `viz-court-transition.ts` for why
   * this is the browser's native API rather than React's `<ViewTransition>`.
   */
  runCourtMorph: (opts: {
    sourceEl: HTMLElement | null;
    next: VizState;
    targetKey: string | null;
    reducedMotion: boolean;
  }) => void;
  /**
   * One-shot: true for the very first render after a court-identity change
   * (`viewIdentityKey` before ≠ after) arrived from OUTSIDE this store —
   * browser back/forward being the case that matters, since Next's
   * navigation there gives no synchronous hook to snapshot the outgoing DOM
   * before the router commits the new one, so `runCourtMorph`'s
   * shared-element approach isn't reachable for it (see F5's task brief:
   * "If a clean reverse is not achievable, a plain 200ms crossfade").
   * `VizWall`/`VizFocused` read this once on mount to opt into that plain
   * crossfade, then call `clearExternalCourtSwap()` so it doesn't replay on
   * an unrelated later render.
   */
  externalCourtSwap: boolean;
  clearExternalCourtSwap: () => void;
}

const VizStateContext = createContext<VizStateContextValue | null>(null);

/**
 * The Visualizations tab's client-side URL binding: `useSearchParams()` in,
 * `router.replace` out. Reads the ONE store `VizStateProvider` mounts —
 * every call site (filters popover, applied strip, chart/cut menus, the
 * focused view, the wall, the saved-views band) shares this same state, so a
 * click in one no longer races a click in another.
 *
 * `hrefFor` returns the same string without navigating, for `<Link href>`
 * tiles (`court-tile.tsx`) that should be crawlable/openable in a new tab
 * rather than only clickable.
 *
 * Before this file existed, each call site called `useVizState()` directly
 * and got its OWN `useState`/ref/effect trio — see this file's git history
 * (`use-viz-state.ts`) for the single-hook version. Two instances agreeing
 * with the URL individually is not the same as agreeing with EACH OTHER: a
 * click in the Filters popover followed quickly by removing a token in the
 * Applied strip could still drop one edit, because the strip's instance
 * resolved its updater against its own stale ref, and when the merged URL
 * landed, the popover's instance treated it as an external navigation and
 * stomped its own optimistic state. Lifting the store into a provider fixes
 * this the same way lifting any duplicated `useState` does: one owner, many
 * readers.
 */
export function useVizState(): VizStateContextValue {
  const ctx = use(VizStateContext);
  if (!ctx) {
    throw new Error(
      "useVizState must be used within a VizStateProvider. Mount " +
        "<VizStateProvider> once, around the Visualizations tab's tree " +
        "(shots-tab.tsx) — every reader below it shares that one store; " +
        "do not mount a second provider or call useVizState above it.",
    );
  }
  return ctx;
}

/**
 * Owns the ONE store `useVizState()` reads: the intended-state ref, the
 * optimistic mirror, the own-queries bookkeeping and the URL re-sync effect,
 * plus `router.replace`. Mount exactly once, around the tab's tree
 * (`shots-tab.tsx`) — every descendant reading `useVizState()` shares this
 * same instance, so a change made through one call site is immediately
 * visible to every other, both optimistically and once the URL settles.
 *
 * `router.replace` (not `push`) so filter/cut changes don't pile up the
 * browser history — matching `vizStateQuery`'s own "one state, one URL"
 * design. `{ scroll: false }` keeps the tab's scroll position across a state
 * change, same as `match-report-context.tsx`'s view switch.
 *
 * `router.replace` is a transition: `useSearchParams()` keeps returning the
 * OLD params until it commits. Two `setState` calls made in that window
 * would each build `next` from the same stale `state` if `state` were the
 * only bookkeeping — so this store keeps two ref-backed pieces, both only
 * ever touched from `setState` (an event handler) or the resync effect below
 * — never read during render, since a ref read/write in the render body
 * itself breaks React's rendering contract:
 *
 * - `intendedRef` — the latest state callers have ASKED for, updated
 *   synchronously the instant `setState` runs, so a second `setState` made
 *   before the first's navigation commits composes onto it via
 *   `applyVizUpdate` instead of a stale closure. Callers that derive `next`
 *   from current state must pass an updater `(prev) => …` to see this value
 *   as `prev`.
 * - `ownQueriesRef` — every query string this store has itself asked the
 *   router for, oldest first. `reconcileVizState` (`viz-url.ts`) is the pure
 *   rule that tells "our own `router.replace` committing" apart from a
 *   genuine external navigation, so a slower own request that finally lands
 *   after a newer one doesn't get mistaken for outside state and stomp
 *   `intendedRef` back to the older value.
 *
 * `state` (in the returned context value) is the OPTIMISTIC value: set the
 * instant `setState` runs, before `router.replace` commits, so pressed
 * pills/tokens/counts/the court reflect the click immediately. It's seeded
 * from the parsed URL via `useState`'s initializer, so the first render
 * matches the URL exactly — no hydration mismatch.
 *
 * When the URL changes to a query this store did NOT itself request —
 * back/forward, a `court-tile.tsx` `<Link>`, any outside navigation — that
 * external state wins: `reconcileVizState` is re-run in an effect keyed on
 * the serialized query string (not object identity, since a re-parsed
 * VizState is a new object every render even when nothing changed).
 */
export function VizStateProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const urlState = parseVizState(searchParams);

  const [state, setRenderedState] = useState<VizState>(urlState);
  const intendedRef = useRef<VizState>(urlState);
  const ownQueriesRef = useRef<string[]>([query]);

  // F5: the morph's destination key (`null` outside a transition) and the
  // one-shot "this court swap arrived from outside the store" flag — see
  // the doc comments on `VizStateContextValue`.
  const [morphTargetKey, setMorphTargetKey] = useState<string | null>(null);
  const [externalCourtSwap, setExternalCourtSwap] = useState(false);

  // F5 fix round 1: keyboard focus (and, in `viz-focused.tsx`'s own
  // scroll-to-top effect, the scroll position) must follow the VIEW change
  // itself, never a view transition settling — a hidden document, a
  // browser without the API, and reduced motion all skip or abort the
  // animation (`document.startViewTransition`'s `ready` rejects with
  // "Transition was aborted because of invalid state"), but `state` still
  // changes underneath it, and this plain effect fires on that alone.
  // Seeded with the INITIAL state's key so the first run always compares
  // equal to itself (`focusTargetAfterViewChange` returns `null`) — first
  // mount must never steal focus.
  const focusTrackedKeyRef = useRef<string | null>(viewIdentityKey(urlState));

  const viewKey = viewIdentityKey(state);
  useEffect(() => {
    const prevKey = focusTrackedKeyRef.current;

    // Final review #1: the fullscreen viewer owns focus while it is up, and
    // it is a portal on `document.body` — so moving focus to the focused
    // view's eyebrow here would put it BEHIND the overlay, silently (every
    // window-level key still works, so nothing looks wrong). A tile's
    // fullscreen glyph changes `cut`/`viewId` AND sets `fullscreen` in one
    // update, and parent effects flush after child ones, so this effect runs
    // right after the viewer's own mount-focus and would undo it. The key is
    // still tracked, so the NEXT change compares against the right baseline
    // and exiting the viewer restores focus to the door as usual.
    if (state.fullscreen === true) {
      focusTrackedKeyRef.current = viewKey;
      return;
    }

    const target = focusTargetAfterViewChange(prevKey, viewKey);

    if (target === "focused-view") {
      document.getElementById(VIZ_FOCUSED_HEADING_ID)?.focus();
    } else if (target === "opened-tile" && prevKey !== null) {
      document.getElementById(courtTileDomId(prevKey))?.focus();
    }

    focusTrackedKeyRef.current = viewKey;
  }, [viewKey, state.fullscreen]);

  useEffect(() => {
    // Read BEFORE `reconcileVizState` overwrites `intendedRef` below — an
    // own query still needs this comparison skipped (own navigations get
    // their morph, if any, from `runCourtMorph` directly, not from this
    // fallback), so the check has to happen while `ownQueriesRef` still
    // reflects the pre-reconciliation bookkeeping.
    const wasOwnQuery = ownQueriesRef.current.includes(query);
    const prevKey = viewIdentityKey(intendedRef.current);

    const reconciled = reconcileVizState({
      urlQuery: query,
      ownQueries: ownQueriesRef.current,
      intended: intendedRef.current,
    });
    intendedRef.current = reconciled.state;
    ownQueriesRef.current = reconciled.ownQueries;
    setRenderedState(reconciled.state);
    // `urlState` is derived from `query` within the same render that
    // produced it, so re-running only when `query` changes is correct —
    // adding `urlState` itself would fire on every render (new object).

    if (!wasOwnQuery && prevKey !== viewIdentityKey(reconciled.state)) {
      setExternalCourtSwap(true);
    }
  }, [query]);

  // `hrefFor`/`setState` wrapped in `useCallback`, and the context value
  // itself in `useMemo` (review I1): every reader downstream of
  // `useVizState()` (the filters popover, applied strip, chart/cut menus, the
  // focused view, the wall, the saved-views band) sits below this ONE
  // provider, so a fresh `{ state, setState, hrefFor }` object on every
  // provider render — regardless of whether `state` itself changed — would
  // re-render every one of them on every keystroke/click anywhere in the
  // tree. `hrefFor` only closes over `pathname`/`searchParams`, and
  // `setState` only closes over refs (stable identity) plus
  // `pathname`/`searchParams`/`router` — none of which change on every
  // render — so both are cheap to keep referentially stable.
  const hrefFor = useCallback(
    (next: VizState): string => {
      const q = vizStateQuery(searchParams, next);
      return q ? `${pathname}?${q}` : pathname;
    },
    [pathname, searchParams],
  );

  const setState = useCallback(
    (next: VizState | ((prev: VizState) => VizState)): void => {
      const resolved = applyVizUpdate(intendedRef.current, next);
      intendedRef.current = resolved;

      const q = vizStateQuery(searchParams, resolved);
      ownQueriesRef.current = [...ownQueriesRef.current, q];

      setRenderedState(resolved);
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // F5's ONE animation. `sourceEl` is the real DOM node the visitor just
  // interacted with (the tile they clicked, or the court they're leaving)
  // — callers find it imperatively (a ref or a `querySelector` off the
  // click event's `currentTarget`), never from React state, because it has
  // to be marked with `view-transition-name` on the OLD DOM, before
  // `setState` mutates anything. `targetKey` identifies whichever element
  // should carry that same name once the NEW DOM exists — NOT a
  // `viewIdentityKey` (two elements can share one: the big court and its
  // own "current" tile in the Views grid — see
  // `VIZ_FOCUSED_COURT_MORPH_TARGET`'s doc comment for the bug that shape
  // caused), but either `VIZ_FOCUSED_COURT_MORPH_TARGET` (every forward
  // morph's destination is always the one big court) or a wall tile's own
  // `courtTileDomId(...)` (the reverse morph — "Back to wall" leaves
  // `next.cut === null`, so the destination can't be derived from `next` at
  // all; it's the tile matching the view being LEFT, computed by the
  // caller from `state`, not `next`).
  //
  // F5 fix round 1: this function is now PURELY decorative — it drives the
  // shared-element morph and nothing else. Focus and scroll used to hang
  // off `transition.ready`/`finished` here, which broke the moment the
  // transition itself was skipped or aborted rather than merely unsupported
  // — a hidden document rejects `ready` with "Transition was aborted
  // because of invalid state" (confirmed live in the signed-in app's
  // preview pane), and every promise branch that existed to catch that
  // still depended on the SAME transition object settling at all. Focus/
  // scroll now live entirely in the provider's own `viewKey`-keyed
  // `useEffect` above (and `viz-focused.tsx`'s pre-existing scroll-to-top
  // effect), which fires off `state` itself — reachable no matter how
  // `state` got there.
  const runCourtMorph = useCallback(
    ({
      sourceEl,
      next,
      targetKey,
      reducedMotion,
    }: {
      sourceEl: HTMLElement | null;
      next: VizState;
      targetKey: string | null;
      reducedMotion: boolean;
    }): void => {
      if (reducedMotion || !sourceEl || !supportsViewTransitions()) {
        setState(next);
        return;
      }

      const previousName = sourceEl.style.viewTransitionName;
      sourceEl.style.viewTransitionName = VIZ_COURT_TRANSITION_NAME;

      const transition = document.startViewTransition(() => {
        // `document.startViewTransition`'s callback must have committed its
        // DOM mutation by the time it returns (or the promise it returns
        // resolves) — a plain `setState` here would leave the actual DOM
        // update to React's own scheduling, which the browser can't wait
        // on. `flushSync` forces both state changes into one synchronous
        // commit, so the "new" snapshot the API captures right after this
        // callback returns is the post-navigation DOM, not the stale one.
        flushSync(() => {
          setMorphTargetKey(targetKey);
          setState(next);
        });

        // Reset the JIT name on `sourceEl` HERE — synchronously, still
        // inside this callback, before the browser captures the "new"
        // snapshot — not only in the `.finally()` below. When the source
        // unmounts (a wall/Views-grid tile morphing into the focused view),
        // this is moot; but a Views-grid tile clicked to switch to a
        // DIFFERENT focused view never unmounts (`VizFocused` stays
        // mounted, only its props change), and React does not reset a
        // style property it didn't itself write — it diffs against its OWN
        // last-rendered style object, and that tile's `viewTransitionName`
        // was `undefined` both before and after this click (it was never
        // this navigation's destination), so React sees no change and
        // leaves the manually-set name sitting on the DOM. Left alone,
        // that tile AND the big court (the real destination) would both
        // carry `VIZ_COURT_TRANSITION_NAME` in the same "new" snapshot —
        // caught live via the `viz-motion-harness` route
        // (`Unexpected duplicate view-transition-name`), see the sibling
        // f5-report.md for the reproduction.
        sourceEl.style.viewTransitionName = previousName;
      });

      // Nothing awaits `ready` any more (see the doc comment above) — this
      // `.catch()` exists ONLY to keep a hidden-document/aborted rejection
      // from surfacing as an unhandled promise rejection in the console.
      transition.ready.catch(() => {});

      transition.finished
        .catch(() => {
          // `finished` rejects if the transition gets skipped (e.g. the
          // visitor clicks again mid-flight, or the document is hidden).
          // The state change above already landed regardless — only the
          // animation itself was interrupted, so there's nothing here to
          // retry.
        })
        .finally(() => {
          sourceEl.style.viewTransitionName = previousName;
          // M5: a second click can start morph 2 (its own `targetKey`)
          // before this `.finally()` for morph 1 runs — clearing
          // unconditionally could land AFTER morph 2 already set its own
          // key, wiping out a still-in-flight morph's target. Only clear
          // the key this morph itself set.
          setMorphTargetKey((k) => (k === targetKey ? null : k));
        });
    },
    [setState],
  );

  const clearExternalCourtSwap = useCallback(() => {
    setExternalCourtSwap(false);
  }, []);

  const value = useMemo(
    () => ({
      state,
      setState,
      hrefFor,
      morphTargetKey,
      runCourtMorph,
      externalCourtSwap,
      clearExternalCourtSwap,
    }),
    [
      state,
      setState,
      hrefFor,
      morphTargetKey,
      runCourtMorph,
      externalCourtSwap,
      clearExternalCourtSwap,
    ],
  );

  return <VizStateContext value={value}>{children}</VizStateContext>;
}
