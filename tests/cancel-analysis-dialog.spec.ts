import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * `CancelAnalysisDialog` (T7): the match page stepper's "Cancel analysis"
 * confirm. Offline — Radix portals draw nothing in a static render, so
 * `ConfirmDialog` is swapped for a stub that prints every prop it is handed,
 * while its body helpers (`ConfirmNote`, `Em`) and `DialogProblem` are the
 * real ones. The request helpers are driven with a stub `fetch`.
 */

const DIALOG =
  "src/components/dashboard/matches/match-detail/cancel-analysis-dialog.tsx";

const stubs = {
  "next/navigation": { useRouter: () => ({ refresh() {} }) },
};

const real = createLoader({ stubs }).load(
  "src/components/ui/confirm-dialog.tsx",
);
const { DialogProblem } = createLoader({ stubs }).load(
  "src/components/ui/dialog-problem.tsx",
) as {
  DialogProblem: React.ComponentType<{ message: string | null | undefined }>;
};

/** Prints the props `ConfirmDialog` receives, as the real one would place them. */
function ConfirmDialogStub(props: {
  open: boolean;
  title: React.ReactNode;
  description: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  cancelLabel?: string;
  tone?: string;
  pending?: boolean;
  error?: string | null;
}) {
  return React.createElement(
    "div",
    {
      "data-dialog": "",
      "data-open": String(props.open),
      "data-tone": props.tone,
      "data-pending": String(Boolean(props.pending)),
    },
    React.createElement("h2", null, props.title),
    React.createElement("p", { "data-description": "" }, props.description),
    props.children,
    React.createElement(DialogProblem, { message: props.error }),
    React.createElement("button", { "data-cancel": "" }, props.cancelLabel),
    React.createElement(
      "button",
      { "data-confirm": "" },
      props.pending
        ? (props.pendingLabel ?? props.confirmLabel)
        : props.confirmLabel,
    ),
  );
}

const loader = createLoader({
  stubs: {
    ...stubs,
    "@/components/ui/confirm-dialog": {
      ...real,
      ConfirmDialog: ConfirmDialogStub,
    },
  },
});

type Result = { ok: true } | { ok: false; error: string };
type ConfirmProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservedSeconds: number | undefined;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
};
const mod = loader.load(DIALOG) as {
  CancelAnalysisConfirm: React.ComponentType<ConfirmProps>;
  CancelAnalysisDialog: React.ComponentType<{
    jobId: string;
    reservedSeconds: number | undefined;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }>;
  requestCancel: (jobId: string, fetchImpl: typeof fetch) => Promise<Result>;
  requestResubmit: (jobId: string, fetchImpl: typeof fetch) => Promise<Result>;
};

const JOB = "00000000-0000-4000-8000-000000000001";

/** The cancel route's own refusal sentences (T2's handler). */
const STARTED = "It started a moment ago and can't be cancelled now.";
const VENDOR = "Couldn't reach Advantage Intelligence. Try again.";

function render(props: Partial<ConfirmProps> = {}) {
  return renderToStaticMarkup(
    React.createElement(mod.CancelAnalysisConfirm, {
      open: true,
      onOpenChange: () => {},
      reservedSeconds: 5340,
      onConfirm: () => {},
      ...props,
    }),
  );
}

/** A `fetch` that records its calls and answers with one response. */
function stubFetch(status: number, body?: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

test("the copy, the red tone and the three labels", () => {
  const html = render();
  expect(html).toContain('data-tone="danger"');
  expect(html).toContain("<h2>Cancel this analysis?</h2>");
  expect(html).toContain(
    "It hasn&#x27;t started yet. The video stays saved, and you can send it for analysis again from the match page.",
  );
  expect(html).toContain('<button data-cancel="">Keep in line</button>');
  expect(html).toContain('<button data-confirm="">Cancel analysis</button>');
  expect(render({ pending: true })).toContain(
    '<button data-confirm="">Cancelling…</button>',
  );
});

test("the note: a clock, and the reserved time in bold going back", () => {
  const html = render();
  // lucide's Clock, inside ConfirmNote's icon slot.
  expect(html).toMatch(/<svg[^>]*lucide-clock[^>]*>/);
  expect(html).toContain(
    '<span class="font-medium text-[var(--ink-900)]">1h 29m</span> goes back to this month&#x27;s analysis time.',
  );
  // No reservation recorded: no invented figure.
  const bare = render({ reservedSeconds: undefined });
  expect(bare).not.toContain("goes back");
  expect(bare).not.toContain("lucide-clock");
});

test("no error until one is given; then the route's sentence shows", () => {
  expect(render()).not.toContain('role="alert"');
  const html = render({ error: STARTED });
  expect(html).toContain('role="alert"');
  expect(html).toContain(
    "It started a moment ago and can&#x27;t be cancelled now.",
  );
});

test("the stateful dialog starts closed, error-free and idle", () => {
  const html = renderToStaticMarkup(
    React.createElement(mod.CancelAnalysisDialog, {
      jobId: JOB,
      reservedSeconds: 5340,
      open: false,
      onOpenChange: () => {},
    }),
  );
  expect(html).toContain('data-open="false"');
  expect(html).toContain('data-pending="false"');
  expect(html).toContain('<button data-confirm="">Cancel analysis</button>');
});

test("confirm POSTs the cancel route, same-origin", async () => {
  const { impl, calls } = stubFetch(200, { status: "cancelled" });
  expect(await mod.requestCancel(JOB, impl)).toEqual({ ok: true });
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe(`/api/splitstep/jobs/${JOB}/cancel`);
  expect(calls[0].init?.method).toBe("POST");
});

test("a 409 or 503 answers with the route's error sentence", async () => {
  const started = stubFetch(409, {
    error: STARTED,
    code: "already_started",
  });
  expect(await mod.requestCancel(JOB, started.impl)).toEqual({
    ok: false,
    error: STARTED,
  });

  const vendor = stubFetch(503, {
    error: VENDOR,
    code: "vendor_unavailable",
  });
  expect(await mod.requestCancel(JOB, vendor.impl)).toEqual({
    ok: false,
    error: VENDOR,
  });

  // No sentence in the body, or no body: a fallback, never an empty line.
  const bare = await mod.requestCancel(JOB, stubFetch(500).impl);
  expect(bare.ok).toBe(false);
  expect(bare.ok === false && bare.error.length).toBeGreaterThan(0);

  // A network failure is not a refusal.
  const offline = (async () => {
    throw new TypeError("Failed to fetch");
  }) as unknown as typeof fetch;
  expect(await mod.requestCancel(JOB, offline)).toEqual({
    ok: false,
    error: "Couldn't reach the server. Check your connection.",
  });
});

test("resend POSTs the existing resubmit route", async () => {
  const { impl, calls } = stubFetch(200, {});
  expect(await mod.requestResubmit(JOB, impl)).toEqual({ ok: true });
  expect(calls[0].url).toBe(`/api/splitstep/jobs/${JOB}/resubmit`);
  expect(calls[0].init?.method).toBe("POST");

  const refused = stubFetch(429, {
    error: "This month's analysis time is used up.",
  });
  expect(await mod.requestResubmit(JOB, refused.impl)).toEqual({
    ok: false,
    error: "This month's analysis time is used up.",
  });
});
