"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { useCoarsePointer } from "@/hooks/use-coarse-pointer";
import { useDismissOnNextPress, useLongPress } from "@/hooks/use-long-press";
import { cn } from "@/lib/utils";

/**
 * Whether an explicit `TooltipProvider` is already above us.
 *
 * Radix requires a provider per tooltip, and `Tooltip` supplies its own so a
 * tooltip works anywhere. But a provider is also what makes a *group*: it owns
 * the skip-delay timer that lets the second tooltip in a cluster appear
 * instantly instead of serving another full delay. Self-providing puts every
 * tooltip in a group of one, so neighbours never share that timer. This marker
 * lets `Tooltip` stand down when a caller has wrapped a cluster deliberately.
 */
const HasTooltipProvider = React.createContext(false);

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <HasTooltipProvider.Provider value={true}>
      <TooltipPrimitive.Provider
        data-slot="tooltip-provider"
        delayDuration={delayDuration}
        {...props}
      />
    </HasTooltipProvider.Provider>
  );
}

/**
 * What a touch-driven `Tooltip` hands its trigger: the way to open it, on a
 * hold or on keyboard focus. `null` with a mouse, and under a caller that
 * owns `open` itself — the trigger then renders exactly as Radix ships it.
 */
const TouchTooltip = React.createContext<{ show: () => void } | null>(null);

/**
 * On a finger, a tooltip opens on press-and-hold and closes on the next press
 * anywhere — the iOS long press, as `/design/ipad` signed off. A tap passes
 * straight through to the control and never names it.
 *
 * Radix has no such mode, so on a coarse pointer an uncontrolled tooltip is
 * controlled from here: every request Radix makes to OPEN — the focus a tap
 * leaves behind, a hover the browser synthesises from it — is ignored, and
 * every request to close (Escape, scroll, a press outside) is honoured. The
 * hold, and Tab from a paired keyboard, arrive from the trigger instead.
 *
 * With a mouse — and on the server and the first render, where
 * `useCoarsePointer()` is false — the props reach Radix untouched, so hover
 * delay, focus and the skip-delay group are exactly what they always were. A
 * caller passing `open` is left alone on either pointer: it already has its
 * own rule for when the tooltip shows (a court dot shows its own while
 * pinned), and the hold would only fight it.
 */
function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const grouped = React.useContext(HasTooltipProvider);
  const coarse = useCoarsePointer();
  const touch = coarse && props.open === undefined;

  const [touchOpen, setTouchOpen] = React.useState(false);
  // The caller's callback through a ref, so `show` and `close` stay stable
  // for the dismiss listener and the context value.
  const onOpenChangeRef = React.useRef(props.onOpenChange);
  React.useEffect(() => {
    onOpenChangeRef.current = props.onOpenChange;
  });
  const show = React.useCallback(() => {
    setTouchOpen(true);
    onOpenChangeRef.current?.(true);
  }, []);
  const close = React.useCallback(() => {
    setTouchOpen(false);
    onOpenChangeRef.current?.(false);
  }, []);
  useDismissOnNextPress(touch && touchOpen, close);
  const touchValue = React.useMemo(() => ({ show }), [show]);

  let root = <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
  if (touch) {
    const {
      defaultOpen: _defaultOpen,
      onOpenChange: _onOpenChange,
      ...rest
    } = props;
    root = (
      <TooltipPrimitive.Root
        data-slot="tooltip"
        {...rest}
        open={touchOpen}
        onOpenChange={(next) => {
          if (!next && touchOpen) close();
        }}
      />
    );
  }
  // Provided on both paths, `null` when not touch-driven, so a tooltip nested
  // in another's subtree never picks up the outer one's `show`.
  root = (
    <TouchTooltip.Provider value={touch ? touchValue : null}>
      {root}
    </TouchTooltip.Provider>
  );

  return grouped ? root : <TooltipProvider>{root}</TooltipProvider>;
}

/** The caller's handler first, then ours unless the caller prevented it. */
function compose<E extends React.SyntheticEvent>(
  theirs: ((event: E) => void) | undefined,
  ours: (event: E) => void,
) {
  return (event: E) => {
    theirs?.(event);
    if (!event.defaultPrevented) ours(event);
  };
}

function TooltipTrigger(
  props: React.ComponentProps<typeof TooltipPrimitive.Trigger>,
) {
  const touch = React.useContext(TouchTooltip);
  const press = useLongPress(() => touch?.show());

  if (!touch) {
    return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
  }

  // Composed with the caller's handlers here; under `asChild`, Radix's Slot
  // then composes the result with the child's own, so neither a caller's
  // `onPointerDown` nor the wrapped button's `onClick` is overwritten. Slot
  // lets the child's `style` win over the callout suppression.
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      {...props}
      onPointerDown={compose(props.onPointerDown, press.onPointerDown)}
      onPointerMove={compose(props.onPointerMove, press.onPointerMove)}
      onPointerUp={compose(props.onPointerUp, press.onPointerUp)}
      onPointerCancel={compose(props.onPointerCancel, press.onPointerCancel)}
      onClickCapture={compose(props.onClickCapture, press.onClickCapture)}
      onContextMenu={compose(props.onContextMenu, press.onContextMenu)}
      // A tap focuses the control too, and must not name it; Tab from a
      // keyboard paired to the iPad still should. `:focus-visible` is the
      // browser's own answer to which of the two this focus was.
      onFocus={compose(props.onFocus, (event) => {
        try {
          if (event.currentTarget.matches(":focus-visible")) touch.show();
        } catch {
          // An engine that cannot match `:focus-visible` — stay quiet.
        }
      })}
      style={{ ...press.style, ...props.style }}
    />
  );
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  showArrow = true,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & {
  showArrow?: boolean;
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-fit origin-(--radix-tooltip-content-transform-origin) animate-in rounded-xl bg-[var(--ink-900)] px-3 py-1.5 text-xs text-balance text-white shadow-[var(--shadow-dropdown)] fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className,
        )}
        {...props}
      >
        {children}
        {showArrow && (
          <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-[var(--ink-900)] fill-[var(--ink-900)]" />
        )}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
