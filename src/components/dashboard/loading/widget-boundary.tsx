"use client";
import { Component, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

class Boundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(
    previous: Readonly<{ children: ReactNode; fallback: ReactNode }>,
  ) {
    if (this.state.failed && previous.children !== this.props.children)
      this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
function Retry({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div role="status" className="text-body-sm py-6">
      <p>Couldn’t load {label.toLowerCase()}.</p>
      <button
        type="button"
        disabled={pending}
        className="mt-2 text-[var(--blue)] disabled:opacity-50"
        onClick={() => startTransition(() => router.refresh())}
      >
        {pending ? "Retrying…" : "Try again"}
      </button>
    </div>
  );
}
export function WidgetBoundary({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  // New streamed children after refresh reset this region, not the whole page.
  return (
    <Boundary key={String(label)} fallback={<Retry label={label} />}>
      {children}
    </Boundary>
  );
}
