"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Copy, Plug, Terminal } from "lucide-react";

import { SettingsAlert } from "@/components/dashboard/settings/settings-alert";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import {
  SettingsCard,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import {
  GRANTS_UNAVAILABLE_ERROR,
  type OAuthGrant,
} from "@/lib/auth/oauth-grants";
import { MCP_GUIDE_URL } from "@/lib/constants";
import { formatShortDate } from "@/lib/ui/date-format";

import { disconnectApp } from "./connections-actions";

/**
 * Settings › Connections: the Ask MCP connector's two cards — the viewer's
 * address and the Claude Code command, and the apps the viewer approved with
 * Disconnect on each. Each app's steps live on the public setup guide
 * (MCP_GUIDE_URL) so they are written once.
 *
 * The apps are named in text only. Anthropic's trademark guidelines allow
 * its logo only with prior approval, and the others are no different, so the
 * rows carry a neutral connector glyph.
 *
 * `grants` is null when the list could not be read; `error` then says so,
 * and the card never claims nothing is connected.
 */
export function ConnectionsSettings({
  mcpUrl,
  grants,
  error,
}: {
  mcpUrl: string;
  grants: OAuthGrant[] | null;
  error: string | null;
}) {
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // The grants are read on the server at load. Approving an app happens in
  // another tab, so re-read them when the viewer comes back to this one —
  // otherwise step 3's promise that the app appears below is a reload away.
  const router = useRouter();
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  return (
    <div className="flex max-w-[660px] flex-col gap-5">
      {message && (
        <SettingsAlert
          type={message.type}
          message={message.text}
          onDismiss={() => setMessage(null)}
        />
      )}

      <SettingsCard className="gap-3">
        <SettingsCardTitle
          trailing={
            <a
              href={MCP_GUIDE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1 text-[12px] text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)]"
            >
              Setup guide
              <span className="sr-only"> (opens in a new tab)</span>
              <ArrowUpRight
                className="size-3"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </a>
          }
        >
          Use Advantage in your AI app
        </SettingsCardTitle>
        <p className="text-[12px] leading-[1.55] text-[var(--ink-600)]">
          Ask about your matches from Claude, ChatGPT, Cursor or any MCP app. It
          reads your statistics the way Ask does, and the questions it asks use
          your Ask questions.
        </p>
        <ol className="flex flex-col gap-4 pt-1">
          <ConnectStep n={1} title="Copy your address">
            <CopyField value={mcpUrl} />
          </ConnectStep>
          <ConnectStep n={2} title="Add it to your app">
            <p className="text-[12px] leading-[1.55] text-[var(--ink-600)]">
              Steps for{" "}
              {GUIDE_APPS.map((app, i) => (
                <span key={app.id}>
                  <a
                    href={`${MCP_GUIDE_URL}#${app.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)]"
                  >
                    {app.label}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  {i < GUIDE_APPS.length - 1 ? " · " : ""}
                </span>
              ))}
            </p>
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--ink-600)]">
                <Terminal
                  className="size-3"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                Claude Code, in a terminal
              </span>
              <CopyField
                value={`claude mcp add --transport http advantage ${mcpUrl}`}
              />
            </div>
          </ConnectStep>
          <ConnectStep n={3} title="Sign in here and choose Allow">
            <p className="text-[12px] leading-[1.55] text-[var(--ink-600)]">
              The app opens this sign-in once, then lists Advantage among its
              tools. Once you approve it, it appears under Connected apps.
            </p>
          </ConnectStep>
        </ol>
      </SettingsCard>

      <SettingsCard>
        <SettingsCardTitle className="pb-2">Connected apps</SettingsCardTitle>
        {grants === null ? (
          <p
            role="alert"
            className="border-t border-[var(--border-hairline)] py-3 text-[12px] text-[var(--ink-600)]"
          >
            {error ?? GRANTS_UNAVAILABLE_ERROR}
          </p>
        ) : grants.length === 0 ? (
          <p className="border-t border-[var(--border-hairline)] py-3 text-[12px] text-[var(--ink-600)]">
            No apps connected yet. Apps you approve appear here.
          </p>
        ) : (
          grants.map((grant) => (
            <GrantRow
              key={grant.clientId}
              grant={grant}
              onDone={(result) =>
                setMessage(
                  result.ok
                    ? { type: "success", text: `${grant.name} disconnected.` }
                    : { type: "error", text: result.error },
                )
              }
            />
          ))
        )}
      </SettingsCard>
    </div>
  );
}

/**
 * One approved app. Disconnect asks once, in the row: it ends the app's
 * sessions at once and the person has to approve it again in the app, the
 * same weight as Account's "Sign out everywhere", which also confirms.
 */
function GrantRow({
  grant,
  onDone,
}: {
  grant: OAuthGrant;
  onDone: (result: { ok: true } | { ok: false; error: string }) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const approved = grant.grantedAt
    ? `Approved ${formatShortDate(grant.grantedAt)} · `
    : "";
  return (
    <div className="flex items-center gap-3.5 border-t border-[var(--border-hairline)] py-3">
      <Plug
        className="size-3.5 shrink-0 text-[var(--ink-600)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <div className="truncate text-[12px] text-[var(--ink-900)]">
          {grant.name}
        </div>
        <div
          className="mt-0.5 text-[11px] text-[var(--ink-600)]"
          suppressHydrationWarning
        >
          {confirming
            ? `${grant.name} loses access now; you would approve it again in that app.`
            : `${approved}Reads your matches and asks questions`}
        </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {confirming ? (
          <>
            <SettingsButton
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </SettingsButton>
            <SettingsButton
              variant="danger"
              size="sm"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await disconnectApp(grant.clientId);
                  if (!result.ok) setConfirming(false);
                  onDone(result);
                })
              }
            >
              Disconnect
            </SettingsButton>
          </>
        ) : (
          <SettingsButton
            variant="outline"
            size="sm"
            onClick={() => setConfirming(true)}
          >
            Disconnect
          </SettingsButton>
        )}
      </div>
    </div>
  );
}

/**
 * The guide's apps, in its order, each opening /mcp on that app's steps. The
 * ids are the guide's own (`content.tsx` in advantage-landing); a renamed id
 * there lands on the guide's first app rather than breaking.
 */
const GUIDE_APPS = [
  { id: "claude", label: "Claude" },
  { id: "claude-code", label: "Claude Code" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "cursor", label: "Cursor" },
  { id: "vscode", label: "VS Code" },
  { id: "other", label: "other apps" },
];

/**
 * One step of the connect card: the guide's three moves in miniature, so the
 * card and the guide teach the same sequence. The number is quiet ink, not
 * blue — nothing on it is a control.
 */
function ConnectStep({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-3">
      <span
        aria-hidden="true"
        className="mt-px flex size-[18px] items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[10px] font-medium text-[var(--ink-700)]"
      >
        {n}
      </span>
      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-[12px] font-medium text-[var(--ink-900)]">
          {title}
        </span>
        {children}
      </div>
    </li>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="flex items-center gap-2 rounded-[8px] border border-[var(--border-field)] bg-[var(--surface-card)] py-1.5 pr-1.5 pl-3">
      <code className="mono min-w-0 flex-1 truncate text-[11px] text-[var(--ink-900)]">
        {value}
      </code>
      <SettingsButton variant="ghost" size="sm" onClick={copy}>
        {copied ? (
          <Check className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <Copy className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
        )}
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      </SettingsButton>
    </div>
  );
}
