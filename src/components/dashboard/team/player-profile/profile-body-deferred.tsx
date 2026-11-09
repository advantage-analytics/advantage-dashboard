"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  ProfileStatisticsPanePending,
  ProfileVisualizationsPanePending,
} from "@/components/dashboard/loading/player-profile-pending";
import { PROFILE_VIEW_PARAM, type ProfileView } from "./profile-view";
import { ProfileViewWhen, useProfileView } from "./profile-frame";

/**
 * The stand-in for the body a request did not render.
 *
 * The profile renders ONE body per request (`page.tsx`, "One body per
 * request"): the Statistics body on a Statistics request (the default URL),
 * the Visualizations body on `?tab=visualizations` (every viz click). The
 * other view's slot holds one of these. The tab switch itself stays
 * client-side (`ProfileViewSwitcher` writes `?tab=` with native history),
 * so when the reader switches to the view that was not rendered there is
 * no body under it — this shows nothing while the other view is up, and
 * the moment its own view is, it draws that view's skeleton (the same one
 * the first load draws) and asks the server for the page again
 * (a soft `router.replace` to the URL it is at, `RefreshOnMount`): the URL
 * now names this view, so that render carries its body, which streams in
 * where the skeleton was. Client state on the
 * page — the wall's player, the store — survives the refresh, as it does
 * every viz click.
 *
 * The two cannot ping-pong: a request renders the body of the view its URL
 * names and the stand-in of the other, each stand-in is shown only while
 * ITS view is the URL's (`ProfileViewWhen`, the same `?tab=` the server
 * read), and the refresh it asks for renders that view's body. So the
 * stand-in a request renders is never shown by that request, and a
 * refresh always lands the body that was missing.
 *
 * A promise, not a blank: the skeleton stands for a request that is in
 * flight (`empty-and-loading.md`). The refresh is asked once per mount.
 *
 * A stand-in is drawn only for a view whose body has not arrived on this
 * visit to the profile — `ProfileBodySlot` keeps every body it has been
 * handed (`ProfileBodyCache`), so the round trip is paid once per view, not
 * once per switch.
 */
export function ProfileStatisticsDeferred() {
  return (
    <ProfileBodyDeferred view="statistics">
      <ProfileStatisticsPanePending />
    </ProfileBodyDeferred>
  );
}

export function ProfileVisualizationsDeferred() {
  return (
    <ProfileBodyDeferred view="visualizations">
      <ProfileVisualizationsPanePending />
    </ProfileBodyDeferred>
  );
}

type KeptBody = { body: ReactNode; query: string };
type ProfileBodyStore = {
  /** Each view's last server-rendered body. */
  kept: Map<ProfileView, KeptBody>;
  /** Records `view` as the one on screen and returns the one that was, or
   * null on the profile's first commit — how a switch is told apart from a
   * load, across page remounts. */
  swapShown: (view: ProfileView) => ProfileView | null;
};

const ProfileBodyCacheContext = createContext<ProfileBodyStore | null>(null);

/**
 * Where the slots keep their bodies: above the page, in
 * `roster/[playerId]/layout.tsx`. Not in the slot's own state: Next keys a
 * page segment by its search params, so the request under `?tab=…` mounts a
 * new page tree and every state inside it starts empty. The layout's segment
 * is keyed by `[playerId]` alone, so it survives a `?tab=` or viz change and
 * starts empty for another player's profile.
 */
export function ProfileBodyCache({ children }: { children: ReactNode }) {
  const [store] = useState<ProfileBodyStore>(() => {
    let shown: ProfileView | null = null;
    return {
      kept: new Map(),
      swapShown(view) {
        const was = shown;
        shown = view;
        return was;
      },
    };
  });
  return (
    <ProfileBodyCacheContext.Provider value={store}>
      {children}
    </ProfileBodyCacheContext.Provider>
  );
}

/**
 * One view's slot in the pane: the body this request rendered, else the last
 * body an earlier render of this profile handed it, else the stand-in.
 *
 * Without it every switch was a round trip: the request that brings
 * Visualizations renders Statistics as a stand-in again (one body per
 * request), so going back threw away the Statistics body the browser already
 * held and paid the full season read a second time — and again on every
 * switch after. The slot keeps the server-rendered element (a description,
 * not a mounted tree — the inactive view still unmounts, `ProfileViewWhen`)
 * in `ProfileBodyCache`, so a switch back re-mounts it from memory without
 * waiting on the server.
 *
 * Kept only while it matches the URL. Statistics reads the season alone, so
 * its body holds for any URL. The Visualizations body is the one for the viz
 * state in the URL at the time it arrived (`?player=`, `?cut=` and its
 * filters), so it is reused only while the URL's query — `tab` aside — is
 * the same; Back or Forward onto a different viz state draws the stand-in
 * and asks for the right body.
 *
 * And never trusted as fresh. Every switch onto a view that has a body to
 * show — kept here, or restored by Next's own back/forward cache, which a
 * native `?tab=` push can also hit — shows it at once and asks for the page
 * again in the background (`revalidate`, with no skeleton: the body stays
 * up). The data may have moved since that body arrived — Edit player renamed
 * them, an analysis finished, a score was rebuilt — and only the view on
 * screen re-renders when that happens, so the other view would otherwise
 * show the old name and numbers until the reader left the player. The fresh
 * body lands in place of the shown one (the same elements, so React updates
 * it rather than remounting it) and is kept in its turn. A switch onto the
 * stand-in does not revalidate: the stand-in's own request is the fetch.
 * A first load is not a switch and asks for nothing more.
 *
 * `body` is null on a request that rendered the other view.
 */
export function ProfileBodySlot({
  view,
  body,
}: {
  view: ProfileView;
  body: ReactNode | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = useProfileView() === view;
  // What the body depends on, beyond the view: nothing for Statistics, the
  // viz state for Visualizations.
  const query = view === "visualizations" ? vizQueryKey(searchParams) : "";
  // Null outside the layout (a spec rendering the slot alone): nothing kept,
  // nothing revalidated.
  const store = useContext(ProfileBodyCacheContext);
  const kept = store?.kept.get(view);
  const shown = body ?? (kept && kept.query === query ? kept.body : null);

  // Stored after commit: a kept body is only ever read by a LATER render (one
  // whose request rendered the other view), never by the one that brings it.
  // Stamped once per body, with the query of the frame it arrived in — the
  // URL the server rendered it for — so a Back/Forward under the same body
  // does not re-stamp it.
  useEffect(() => {
    if (store && body !== null && store.kept.get(view)?.body !== body)
      store.kept.set(view, { body, query });
  }, [store, view, body, query]);

  // A switch onto this view — the store, not this slot, remembers what was
  // on screen, since a switch can remount the page — revalidates what it
  // shows. Once per switch: `shown` is this view from then on.
  const hasBody = shown !== null;
  useEffect(() => {
    if (!store || !active) return;
    const was = store.swapShown(view);
    if (was !== null && was !== view && hasBody) revalidate(router);
  }, [store, active, view, hasBody, router]);

  if (shown !== null) return <>{shown}</>;
  return view === "statistics" ? (
    <ProfileStatisticsDeferred />
  ) : (
    <ProfileVisualizationsDeferred />
  );
}

/** The URL's query without `tab`, in a stable order — a key, not a URL. */
function vizQueryKey(params: URLSearchParams): string {
  const rest = [...params.entries()].filter(
    ([key]) => key !== PROFILE_VIEW_PARAM,
  );
  rest.sort(([a, x], [b, y]) =>
    a === b ? x.localeCompare(y) : a.localeCompare(b),
  );
  return rest.map(([key, value]) => `${key}=${value}`).join("&");
}

function ProfileBodyDeferred({
  view,
  children,
}: {
  view: ProfileView;
  children: ReactNode;
}) {
  return (
    <ProfileViewWhen view={view}>
      {children}
      <RefreshOnMount />
    </ProfileViewWhen>
  );
}

/**
 * Asks the server for the URL already in the address bar — a soft
 * navigation to it, not `router.refresh()`.
 *
 * The switch writes `?tab=` with native history, which updates the URL but
 * not the router's tree: its page segment is still keyed by the search the
 * page was rendered for. A refresh is built from that tree, so its answer
 * (for the new search) did not match what the router expected; Next retried
 * once and then fell back to a full document load — every switch to an
 * unloaded view reloaded the whole app and threw away every client state on
 * it. A `replace` to the current URL is routed like any navigation: the
 * shared layouts stay, only the page is fetched, and the URL does not change.
 */
function RefreshOnMount() {
  const router = useRouter();
  useEffect(() => {
    revalidate(router);
  }, [router]);
  return null;
}

/** A soft navigation to the URL the address bar already shows (see above). */
function revalidate(router: ReturnType<typeof useRouter>) {
  router.replace(window.location.pathname + window.location.search, {
    scroll: false,
  });
}
