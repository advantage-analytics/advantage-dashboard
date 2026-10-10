import * as React from "react";

/** Readers for a React element tree that was never rendered. */

type Props = Record<string, unknown>;
export type TreeElement = React.ReactElement<
  Props & { children?: React.ReactNode }
>;

/**
 * The first element under `node` whose props satisfy `pred`. A function
 * component named in `enter` (or every one, for "all") is called on the way
 * down; any other is walked through its children, since a component that
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
  if (
    typeof element.type === "function" &&
    (enter === "all" || enter.includes(element.type.name))
  ) {
    const render = element.type as (props: Props) => React.ReactNode;
    return findWhere(render(element.props), pred, enter);
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

/** One request in a stroke row's ⋯ menu (`ShotMenuItem`). */
export type MenuItemProbe = {
  key: string;
  label: string;
  description?: string;
  run: () => void;
};

/**
 * The requests a stroke row hands its ⋯ menu — `ShotNumberLane`'s `items`,
 * in the menu's order — or none where the row has no menu. The menu draws
 * them only open, in a portal, so a spec reads them off the tree instead.
 */
export function menuItems(tree: React.ReactNode): MenuItemProbe[] {
  const lane = findWhere(tree, (props) => Array.isArray(props.items));
  return (lane?.props.items as MenuItemProbe[] | undefined) ?? [];
}
