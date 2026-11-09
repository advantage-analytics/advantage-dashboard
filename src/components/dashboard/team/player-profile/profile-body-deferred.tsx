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
import { ProfileViewWhen } from "./profile-frame";

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
 * now names this view, so that render carries
 * its body, which streams in where the skeleton was. Client state on the
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
type KeptBodies = Map<ProfileView, KeptBody>;

const ProfileBodyCacheContext = createContext<KeptBodies | null>(null);

/**
 * Where the slots keep their bodies: above the page, in
 * `roster/[playerId]/layout.tsx`. Not in the slot's own state: Next keys a
 * page segment by its search params, so the refresh under `?tab=…` mounts a
 * new page tree and every state inside it starts empty. The layout's segment
 * is keyed by `[playerId]` alone, so it survives a `?tab=` or viz change and
 * starts empty for another player's profile.
 */
export function ProfileBodyCache({ children }: { children: ReactNode }) {
  const [bodies] = useState<KeptBodies>(() => new Map());
  return (
    <ProfileBodyCacheContext.Provider value={bodies}>
      {children}
    </ProfileBodyCacheContext.Provider>
  );
}

/**
 * One view's slot in the pane: the body this request rendered, else the last
 * body an earlier render of this profile handed it, else the stand-in.
 *
 * Without it every switch was a round trip: the refresh that brings
 * Visualizations renders Statistics as a stand-in again (one body per
 * request), so going back threw away the Statistics body the browser already
 * held and paid the full season read a second time — and again on every
 * switch after. The slot keeps the server-rendered element (a description,
 * not a mounted tree — the inactive view still unmounts, `ProfileViewWhen`)
 * in `ProfileBodyCache`, so a switch back re-mounts it from memory with no
 * request at all.
 *
 * Kept only while it is current. Statistics reads the season alone, so its
 * body holds for any URL. The Visualizations body is the one for the viz
 * state in the URL at the time it arrived (`?player=`, `?cut=` and its
 * filters), so it is reused only while the URL's query — `tab` aside — is
 * the same; Back or Forward onto a different viz state draws the stand-in
 * and asks for the right body.
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
  const searchParams = useSearchParams();
  // What the body depends on, beyond the view: nothing for Statistics, the
  // viz state for Visualizations.
  const query = view === "visualizations" ? vizQueryKey(searchParams) : "";
  // Outside the layout (a spec rendering the slot alone) it keeps nothing
  // past its own mount.
  const shared = useContext(ProfileBodyCacheContext);
  const [own] = useState<KeptBodies>(() => new Map());
  const bodies = shared ?? own;

  // Stored after commit: a kept body is only ever read by a LATER render (one
  // whose request rendered the other view), never by the one that brings it.
  // Stamped once per body, with the query of the frame it arrived in — the
  // URL the server rendered it for — so a Back/Forward under the same body
  // does not re-stamp it.
  useEffect(() => {
    if (body !== null && bodies.get(view)?.body !== body)
      bodies.set(view, { body, query });
  }, [bodies, view, body, query]);

  const kept = bodies.get(view);
  if (body !== null) return <>{body}</>;
  if (kept && kept.query === query) return <>{kept.body}</>;
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
    router.replace(window.location.pathname + window.location.search, {
      scroll: false,
    });
  }, [router]);
  return null;
}
