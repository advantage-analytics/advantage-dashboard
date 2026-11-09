/**
 * The lightbox's one spatial motion: a clicked card's court grows into the
 * lightbox's court, and shrinks back into the card when the lightbox closes.
 * Everything else about opening and closing is an opacity fade.
 *
 * ── Mechanism ────────────────────────────────────────────────────────────
 * A FLIP over a copy of the card's court, animated with the Web Animations
 * API — not `document.startViewTransition`. The view-transition morph this
 * tab once had (removed in 7c059e446) needed both ends of the move in the DOM
 * at one synchronous moment; the lightbox has neither: its shell is a lazy
 * chunk (`next/dynamic` on the match report, `React.lazy` on the season
 * page), it portals through Radix, and the season's court arrives a server
 * round trip after the dialog does (`pending`). A view transition would also
 * freeze the page while it plays, and the browser aborts one in a hidden
 * document. React's `<ViewTransition>` is not in react@19.1.0.
 *
 * So the click clones the card's `<svg>` into a fixed layer above the page at
 * the card's own spot (nothing waits on React), and the copy flies to
 * whatever stands for the lightbox's court at that moment: the shell's
 * stage, or the loading bar drawn in its place, both marked
 * `data-court-morph-target`. A target that appears or changes mid-flight
 * (the chunk landing, the season's court replacing its loading bar) is
 * re-aimed at from wherever the copy is. Before any target exists the copy
 * heads for where the stage will be (`predictedStage`). While the copy flies,
 * every target is hidden (`html[data-viz-court-morph]`, `globals.css`), so the
 * lightbox's own court is the final frame: it is revealed under the copy,
 * which then fades out.
 *
 * The move is transform (the copy) and clip-path (the apron behind it,
 * growing from the card's art box to the stage) only — nothing that lays out.
 * Reduced motion never arms it; the lightbox then only fades.
 *
 * A leaf module (no React): `wall-card.tsx` and `court-tile.tsx` arm it on a
 * plain click, `viz-lightbox-shell.tsx` asks it to run the close.
 */

import type { Cut } from "./viz-model";
import {
  VIEWER_COURT,
  VIEWER_LANDING_FRAME,
  serveViewBoxRectToViewer,
  viewerArtPoint,
  viewerInitialTransform,
  viewerLandingHalf,
} from "./court-geometry";
import type { PanZoom } from "./pan-zoom";
import { LIGHTBOX_BOX_CLASS } from "./lightbox-frame";

/** Open: the arrival curve and length (`animate.md`: 300–500ms for an
 *  overlay, ease-out-expo-like for arrivals). */
export const COURT_MORPH_OPEN_MS = 380;
const OPEN_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
/** The copy's fade once the lightbox's own court is revealed under it. */
const SETTLE_MS = 100;
/** Close: faster than the open, a standard ease-in-out. */
export const COURT_MORPH_CLOSE_MS = 240;
export const COURT_MORPH_CLOSE_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
/** Reduced motion's close: the fade-in's own length (tw-animate's 150ms). */
export const COURT_MORPH_REDUCED_CLOSE_MS = 150;
/** How long the copy waits on a lightbox that never shows up. */
const TARGET_WAIT_MS = 2500;

const TARGET_SELECTOR = "[data-court-morph-target]";
const FLYING_ATTR = "data-viz-court-morph";
const STAGE_RADIUS = "10px";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Source {
  /** The card (`<a>`), kept for a card with no id. */
  card: HTMLElement;
  /** Its id, looked up again at close — the wall may have re-rendered it. */
  id: string | null;
  cut: Cut;
}

interface Ghost {
  root: HTMLDivElement;
  art: HTMLDivElement;
  /** The card's art box, hidden while its copy is away. */
  hidden: HTMLElement;
}

interface OpenFlight {
  ghost: Ghost;
  source: Source;
  /** The copy's frame at the card (its art box, its svg box, the court in it). */
  from: {
    box: Rect;
    radius: string;
    svg: Rect;
    content: Rect;
    region: Rect;
    exact: boolean;
  };
  target: Element | null;
  aimed: string;
  startedAt: number;
  /** When the current aim's animation ends. */
  endsAt: number;
  ended: boolean;
  raf: number;
  timers: number[];
}

let opened: Source | null = null;
let flight: OpenFlight | null = null;
let closing: { ghost: Ghost; timer: number } | null = null;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function canAnimate(): boolean {
  return (
    typeof document !== "undefined" &&
    document.visibilityState === "visible" &&
    typeof Element.prototype.animate === "function" &&
    !prefersReducedMotion()
  );
}

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** The element painting the art's apron: the art box itself (a saved-view
 *  tile) or its parent (a wall card, whose art box sits centred in it). */
function apronBoxOf(art: HTMLElement): HTMLElement {
  const bg = getComputedStyle(art).backgroundColor;
  const clear = bg === "transparent" || bg === "rgba(0, 0, 0, 0)";
  return clear && art.parentElement ? art.parentElement : art;
}

/** Where an svg draws its viewBox inside its box (`xMidYMid meet`). */
function contentRect(svg: SVGSVGElement, box: Rect): Rect {
  const vb = svg.viewBox.baseVal;
  if (!vb || vb.width === 0 || vb.height === 0) return box;
  const s = Math.min(box.w / vb.width, box.h / vb.height);
  const w = vb.width * s;
  const h = vb.height * s;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/**
 * A spot on the card's court and the same spot in `VIEWER_COURT`'s units, so
 * the copy can be laid over the lightbox's court exactly:
 * - a serve frame (`data-serve-frame`) draws the viewer's far half under a
 *   group transform, so its whole viewBox maps back exactly
 *   (`serveViewBoxRectToViewer`);
 * - the return frame draws the court on its side, in units of its own, then
 *   turns it; its first court rect is the whole doubles court, and its box on
 *   screen is that court whichever way it is turned — `VIEWER_COURT.doubles`.
 * Anything else falls back to the half the lightbox opens on (pass 2's
 * framing), or the whole court for a contact cut.
 */
function anchorFor(
  svg: SVGSVGElement,
  svgBox: Rect,
  cut: Cut,
): { content: Rect; region: Rect; exact: boolean } {
  const vb = svg.viewBox.baseVal;
  if (svg.hasAttribute("data-serve-frame") && vb && vb.width > 0) {
    return {
      content: contentRect(svg, svgBox),
      region: serveViewBoxRectToViewer({
        x: vb.x,
        y: vb.y,
        w: vb.width,
        h: vb.height,
      }),
      exact: true,
    };
  }
  const surface = svg.querySelector(":scope > g > g > g > rect");
  if (surface) {
    const r = rectOf(surface);
    const d = VIEWER_COURT.doubles;
    if (r.w > 0 && r.h > 0) {
      return {
        content: r,
        region: { x: d.x, y: d.y, w: d.w, h: d.h },
        exact: true,
      };
    }
  }
  const f =
    viewerLandingHalf(cut) !== null
      ? VIEWER_LANDING_FRAME
      : VIEWER_COURT.courtFrame;
  return {
    content: contentRect(svg, svgBox),
    region: { x: f.minX, y: f.minY, w: f.w, h: f.h },
    exact: false,
  };
}

/** `region` drawn on a stage at `stage` (screen) under transform `t`. */
function regionOnStage(region: Rect, stage: Rect, t: PanZoom): Rect {
  const a = viewerArtPoint(region.x, region.y);
  const b = viewerArtPoint(region.x + region.w, region.y + region.h);
  return {
    x: stage.x + t.px + a.x * t.z,
    y: stage.y + t.py + a.y * t.z,
    w: (b.x - a.x) * t.z,
    h: (b.y - a.y) * t.z,
  };
}

/**
 * The copy's transform (from its own box at 0,0, origin top-left) that puts
 * the court it draws (`content`, inside `svg`) onto `onto`, centred. `exact`
 * stretches each axis on its own so the lines land on the lightbox's lines —
 * the return frame draws its court a little narrower than the viewer does, so
 * its marks are a touch wider than round for the length of the move. A
 * fallback anchor only fits, never stretches.
 */
function transformOnto(
  svg: Rect,
  content: Rect,
  onto: Rect,
  exact: boolean,
): string {
  const fit = Math.min(onto.w / content.w, onto.h / content.h);
  const kx = exact ? onto.w / content.w : fit;
  const ky = exact ? onto.h / content.h : fit;
  const cx = onto.x + onto.w / 2;
  const cy = onto.y + onto.h / 2;
  const ox = content.x - svg.x + content.w / 2;
  const oy = content.y - svg.y + content.h / 2;
  return `translate(${cx - ox * kx}px, ${cy - oy * ky}px) scale(${kx}, ${ky})`;
}

function insetOf(r: Rect, radius: string): string {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  return `inset(${r.y}px ${vw - (r.x + r.w)}px ${vh - (r.y + r.h)}px ${r.x}px round ${radius})`;
}

function cornerRadius(el: HTMLElement): string {
  const s = getComputedStyle(el);
  return `${s.borderTopLeftRadius} ${s.borderTopRightRadius} ${s.borderBottomRightRadius} ${s.borderBottomLeftRadius}`;
}

let copies = 0;

/**
 * Gives a copied svg's own defs (clip paths, filters, gradients) ids of their
 * own and points its references at them. Left alone, `url(#id)` resolves to
 * the card's originals — and those draw nothing while the card's art is
 * `visibility: hidden` for the flight (a clip path whose shapes are hidden
 * clips everything away).
 */
function reidentify(copy: SVGSVGElement): void {
  const suffix = `-morph${++copies}`;
  const renamed = new Map<string, string>();
  copy.querySelectorAll("[id]").forEach((el) => {
    const next = `${el.id}${suffix}`;
    renamed.set(el.id, next);
    el.id = next;
  });
  if (renamed.size === 0) return;
  const swap = (value: string) =>
    value.replace(
      /url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/g,
      (whole, id: string) =>
        renamed.has(id) ? `url(#${renamed.get(id)})` : whole,
    );
  copy.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.value.includes("url(")) {
        el.setAttribute(attr.name, swap(attr.value));
      } else if (
        (attr.name === "href" || attr.name === "xlink:href") &&
        attr.value.startsWith("#") &&
        renamed.has(attr.value.slice(1))
      ) {
        el.setAttribute(attr.name, `#${renamed.get(attr.value.slice(1))}`);
      }
    }
  });
}

function buildGhost(
  svg: SVGSVGElement,
  svgBox: Rect,
  apron: string,
  hidden: HTMLElement,
): Ghost {
  const root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  root.setAttribute("data-viz-court-morph-ghost", "");
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    zIndex: "60",
    pointerEvents: "none",
    background: apron,
    willChange: "clip-path, opacity",
  });
  const art = document.createElement("div");
  Object.assign(art.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: `${svgBox.w}px`,
    height: `${svgBox.h}px`,
    transformOrigin: "0 0",
    willChange: "transform",
  });
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.removeAttribute("id");
  reidentify(copy);
  copy.setAttribute("width", "100%");
  copy.setAttribute("height", "100%");
  copy.style.display = "block";
  copy.style.width = "100%";
  copy.style.height = "100%";
  art.appendChild(copy);
  root.appendChild(art);
  document.body.appendChild(root);
  hidden.style.visibility = "hidden";
  return { root, art, hidden };
}

function removeGhost(ghost: Ghost): void {
  ghost.root.getAnimations().forEach((a) => a.cancel());
  ghost.art.getAnimations().forEach((a) => a.cancel());
  ghost.root.remove();
  ghost.hidden.style.visibility = "";
}

/** The lightbox's court as it stands now: the last target on the page. */
function currentTarget(): Element | null {
  const all = document.querySelectorAll(TARGET_SELECTOR);
  for (let i = all.length - 1; i >= 0; i--) {
    const r = all[i].getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return all[i];
  }
  return null;
}

/**
 * Where the stage will stand before any lightbox is on the page (the match
 * report's chunk still loading): the box measured off its own class, the
 * stage inside it by the shell's spacing — header 88px, control row 53px,
 * a 340px right column 24px away on a wide screen, the legend and footer
 * under it. A guess the flight re-aims from as soon as the real one mounts.
 */
function predictedStage(): Rect {
  const probe = document.createElement("div");
  probe.className = LIGHTBOX_BOX_CLASS;
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const box = rectOf(probe);
  probe.remove();
  const wide = window.matchMedia("(min-width: 768px)").matches;
  const x = box.x + 24;
  const y = box.y + 141;
  const w = wide ? Math.min(800, box.w - 48 - 364) : box.w - 48;
  const h = wide ? Math.max(360, box.y + box.h - 113 - y) : 420;
  return { x, y, w, h };
}

/** The court rect for the flight's target (or the predicted stage). */
function aimFor(f: OpenFlight): { box: Rect; court: Rect } {
  const stage = f.target ? rectOf(f.target) : predictedStage();
  const t = viewerInitialTransform(f.source.cut, { w: stage.w, h: stage.h });
  return { box: stage, court: regionOnStage(f.from.region, stage, t) };
}

function setFlying(on: boolean): void {
  if (on) document.documentElement.setAttribute(FLYING_ATTR, "open");
  else document.documentElement.removeAttribute(FLYING_ATTR);
}

/** Starts (or re-aims) the open flight at its current target. Returns
 *  whether it moved the aim. */
function launch(f: OpenFlight): boolean {
  const { box, court } = aimFor(f);
  const clipTo = insetOf(box, STAGE_RADIUS);
  const moveTo = transformOnto(f.from.svg, f.from.content, court, f.from.exact);
  const key = `${clipTo}|${moveTo}`;
  if (key === f.aimed) return false;
  const elapsed = performance.now() - f.startedAt;
  const first = f.aimed === "";
  const remaining = first
    ? COURT_MORPH_OPEN_MS
    : Math.max(140, COURT_MORPH_OPEN_MS - elapsed);
  // From wherever the copy is now: the card at the start, mid-air on a
  // re-aim.
  const clipFrom = first
    ? insetOf(f.from.box, f.from.radius)
    : getComputedStyle(f.ghost.root).clipPath;
  const moveFrom = first
    ? `translate(${f.from.svg.x}px, ${f.from.svg.y}px) scale(1, 1)`
    : getComputedStyle(f.ghost.art).transform;
  f.ghost.root.getAnimations().forEach((a) => a.cancel());
  f.ghost.art.getAnimations().forEach((a) => a.cancel());
  const timing: KeyframeAnimationOptions = {
    duration: remaining,
    easing: OPEN_EASE,
    fill: "forwards",
  };
  f.ghost.root.animate([{ clipPath: clipFrom }, { clipPath: clipTo }], timing);
  f.ghost.art.animate([{ transform: moveFrom }, { transform: moveTo }], timing);
  f.aimed = key;
  if (first) f.startedAt = performance.now();
  f.endsAt = performance.now() + remaining;
  f.timers.push(window.setTimeout(() => land(f), remaining));
  return true;
}

/** Watches for the target to appear or change while the copy flies. */
function watch(f: OpenFlight): void {
  if (flight !== f) return;
  const next = currentTarget();
  if (next === null && f.target !== null && !f.target.isConnected) {
    // The lightbox went away mid-flight (closed before its chunk loaded):
    // the copy lets go rather than hang over the page.
    settle(f);
    return;
  }
  if (next !== f.target && next !== null) {
    f.target = next;
    if (!launch(f) && f.ended) land(f);
  }
  f.raf = requestAnimationFrame(() => watch(f));
}

/** The copy has arrived. With a lightbox under it, reveal its court and fade
 *  the copy out; with none yet, hold until one mounts or the wait runs out. */
function land(f: OpenFlight): void {
  if (flight !== f) return;
  // A timer from before a re-aim: the copy is still on its way.
  if (performance.now() + 2 < f.endsAt) return;
  f.ended = true;
  if (f.target === null || !f.target.isConnected) return;
  settle(f);
}

function settle(f: OpenFlight): void {
  if (flight !== f) return;
  flight = null;
  cancelAnimationFrame(f.raf);
  f.timers.forEach((t) => window.clearTimeout(t));
  setFlying(false);
  const ghost = f.ghost;
  ghost.root.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: SETTLE_MS,
    easing: "linear",
    fill: "forwards",
  });
  window.setTimeout(() => removeGhost(ghost), SETTLE_MS + 10);
}

/** Ends an open flight at once: the copy goes, the lightbox's court shows. */
function finishOpen(): void {
  const f = flight;
  if (!f) return;
  flight = null;
  cancelAnimationFrame(f.raf);
  f.timers.forEach((t) => window.clearTimeout(t));
  setFlying(false);
  removeGhost(f.ghost);
}

function finishClose(): void {
  if (!closing) return;
  window.clearTimeout(closing.timer);
  removeGhost(closing.ghost);
  closing = null;
}

/**
 * A card was clicked (plain left click) and is about to open the lightbox:
 * its court starts for the stage now. Remembers the card either way, so the
 * close can shrink back into it.
 */
export function armCourtMorph(card: HTMLElement, cut: Cut): void {
  finishOpen();
  finishClose();
  const source: Source = { card, id: card.id || null, cut };
  opened = source;
  if (!canAnimate()) return;
  const artEl = card.querySelector<HTMLElement>("[data-viz-court-art]");
  const svg = artEl?.querySelector<SVGSVGElement>("svg");
  if (!artEl || !svg) return;
  const apronEl = apronBoxOf(artEl);
  const box = rectOf(apronEl);
  const svgBox = rectOf(svg);
  if (box.w === 0 || svgBox.w === 0) return;
  const ghost = buildGhost(
    svg,
    svgBox,
    getComputedStyle(apronEl).backgroundColor,
    artEl,
  );
  const from = {
    box,
    radius: cornerRadius(apronEl),
    svg: svgBox,
    ...anchorFor(svg, svgBox, cut),
  };
  ghost.root.style.clipPath = insetOf(box, from.radius);
  ghost.art.style.transform = `translate(${svgBox.x}px, ${svgBox.y}px)`;
  const f: OpenFlight = {
    ghost,
    source,
    from,
    target: currentTarget(),
    aimed: "",
    startedAt: performance.now(),
    endsAt: 0,
    ended: false,
    raf: 0,
    timers: [],
  };
  flight = f;
  setFlying(true);
  launch(f);
  f.raf = requestAnimationFrame(() => watch(f));
  // A lightbox that never mounts (the open was dropped) lets the card go.
  f.timers.push(
    window.setTimeout(() => {
      if (flight === f) settle(f);
    }, TARGET_WAIT_MS),
  );
}

/** Whether `el` has any part inside the viewport. */
function onScreen(r: Rect): boolean {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  return (
    r.w > 0 && r.h > 0 && r.x < vw && r.x + r.w > 0 && r.y < vh && r.y + r.h > 0
  );
}

/**
 * The lightbox is closing: an open flight still under way ends at once, and
 * the court shrinks from the stage back into the card it came from when that
 * card is on screen. Returns how long the lightbox should keep fading before
 * it unmounts: the close's length, reduced motion's quicker fade, or 0 in a
 * hidden tab (nothing would play).
 */
export function runCourtMorphClose(
  stage: HTMLElement | null,
  cut: Cut,
  transform: PanZoom | null,
): number {
  finishOpen();
  finishClose();
  const source = opened;
  opened = null;
  if (typeof document === "undefined") return 0;
  if (document.visibilityState !== "visible") return 0;
  if (prefersReducedMotion()) return COURT_MORPH_REDUCED_CLOSE_MS;
  if (typeof Element.prototype.animate !== "function")
    return COURT_MORPH_CLOSE_MS;
  const card =
    source === null
      ? null
      : source.id !== null
        ? document.getElementById(source.id)
        : source.card;
  const artEl = card?.isConnected
    ? card.querySelector<HTMLElement>("[data-viz-court-art]")
    : null;
  const svg = artEl?.querySelector<SVGSVGElement>("svg");
  if (!stage || !artEl || !svg || source === null) return COURT_MORPH_CLOSE_MS;
  const apronEl = apronBoxOf(artEl);
  const box = rectOf(apronEl);
  const svgBox = rectOf(svg);
  const stageBox = rectOf(stage);
  if (!onScreen(box) || svgBox.w === 0 || stageBox.w === 0)
    return COURT_MORPH_CLOSE_MS;

  const { content, region, exact } = anchorFor(svg, svgBox, source.cut);
  const t =
    transform ??
    viewerInitialTransform(source.cut, { w: stageBox.w, h: stageBox.h });
  const court = regionOnStage(region, stageBox, t);
  // The copy is clipped to the stage, so a court zoomed past it starts
  // cropped, as it is on screen.
  const ghost = buildGhost(
    svg,
    svgBox,
    getComputedStyle(apronEl).backgroundColor,
    artEl,
  );
  const timing: KeyframeAnimationOptions = {
    duration: COURT_MORPH_CLOSE_MS,
    easing: COURT_MORPH_CLOSE_EASE,
    fill: "forwards",
  };
  ghost.root.animate(
    [
      { clipPath: insetOf(stageBox, STAGE_RADIUS), opacity: 0 },
      { opacity: 1, offset: 0.25 },
      { clipPath: insetOf(box, cornerRadius(apronEl)), opacity: 1 },
    ],
    timing,
  );
  ghost.art.animate(
    [
      { transform: transformOnto(svgBox, content, court, exact) },
      { transform: `translate(${svgBox.x}px, ${svgBox.y}px) scale(1, 1)` },
    ],
    timing,
  );
  closing = {
    ghost,
    timer: window.setTimeout(finishClose, COURT_MORPH_CLOSE_MS),
  };
  return COURT_MORPH_CLOSE_MS;
}
