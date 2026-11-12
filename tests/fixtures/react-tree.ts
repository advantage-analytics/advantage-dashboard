import * as React from "react";

/** Readers for a React element tree that was never rendered. */

type Props = Record<string, unknown>;
export type TreeElement = React.ReactElement<
  Props & { children?: React.ReactNode }
>;

/**
 * The first element under `node` whose props satisfy `pred`. A function
 * component named in `enter` (or every one, for "all") is called on the way
 * down, a memoised one by the name of the function it wraps; any other is
 * walked through its children, since a component that
 * uses hooks cannot be called outside a render.
 */
export function findWhere(
  node: React.ReactNode,
  pred: (props: Props) => boolean,
  enter: readonly string[] | "all" = [],
): TreeElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findWhere(child, pred, enter);
      if (hit) return hit;
    }
    return null;
  }
  if (!React.isValidElement(node)) return null;
  const element = node as TreeElement;
  if (pred(element.props)) return element;
  // A memoised component is entered through `memo`, by the name of the
  // function it wraps.
  const memoised = (element.type as { type?: unknown } | null)?.type;
  const render =
    typeof element.type === "function"
      ? element.type
      : typeof element.type === "object" && typeof memoised === "function"
        ? memoised
        : null;
  if (render && (enter === "all" || enter.includes(render.name))) {
    return findWhere(
      (render as (props: Props) => React.ReactNode)(element.props),
      pred,
      enter,
    );
  }
  return findWhere(element.props.children, pred, enter);
}

/** The first element under `node` whose props carry `attr`. */
export function findByProp(
  node: React.ReactNode,
  attr: string,
  enter?: readonly string[] | "all",
): TreeElement | null {
  return findWhere(node, (props) => attr in props, enter);
}

/**
 * Every element under `node`, components included. A component that needs
 * hooks (an `EditableCell`, a tooltip root) cannot run outside a render, so
 * its children are walked in its place — and its `editor`, which is where a
 * cell keeps the input it mounts.
 */
export function elements(
  node: React.ReactNode,
  out: TreeElement[] = [],
): TreeElement[] {
  if (Array.isArray(node)) {
    for (const child of node) elements(child, out);
    return out;
  }
  if (!React.isValidElement(node)) return out;
  const element = node as TreeElement;
  out.push(element);
  if (typeof element.type === "function") {
    const error = console.error;
    console.error = () => {};
    try {
      const render = element.type as (props: Props) => React.ReactNode;
      return elements(render(element.props), out);
    } catch {
      elements(element.props.editor as React.ReactNode, out);
    } finally {
      console.error = error;
    }
  }
  return elements(element.props.children, out);
}

/** One button in a selected stroke's tray, as a spec presses it. */
export type TrayButtonProbe = {
  key: string;
  label: string;
  ariaLabel: string;
  click: (event: { stopPropagation: () => void }) => void;
};

/**
 * The buttons of a stroke row's tray (`ShotTray`), in order — none where the
 * row draws no tray. Read off the tree: each is the `BlackTextAction` element
 * carrying `data-shot-action`.
 */
export function trayButtons(tree: React.ReactNode): TrayButtonProbe[] {
  return elements(tree)
    .filter(
      (element) =>
        typeof element.type === "function" &&
        "data-shot-action" in element.props,
    )
    .map((element) => ({
      key: element.props["data-shot-action"] as string,
      label: element.props.children as string,
      ariaLabel: element.props["aria-label"] as string,
      click: element.props.onClick as TrayButtonProbe["click"],
    }));
}
