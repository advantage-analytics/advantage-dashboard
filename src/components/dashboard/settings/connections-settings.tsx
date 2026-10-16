"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Plug, Terminal } from "lucide-react";

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
import { formatShortDate } from "@/lib/ui/date-format";

import { disconnectApp } from "./connections-actions";

/**
 * Settings › Connections: the Ask MCP connector's two cards — how to connect
 * Claude, and the apps the viewer approved with Disconnect on each.
 *
 * Claude is named in text only. Anthropic's trademark guidelines allow its
 * logo only with prior approval, so the rows carry a neutral connector glyph.
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
        <SettingsCardTitle>Use Advantage in Claude</SettingsCardTitle>
        <p className="text-[12px] leading-[1.55] text-[var(--ink-600)]">
          Ask Claude about your matches in claude.ai, Claude Desktop or Claude
          Code. It reads your statistics the way Ask does and spends your Ask
          questions; it cannot change anything.
        </p>
        <ol className="flex flex-col gap-1.5 text-[12px] text-[var(--ink-700)]">
          <li>
            1. In Claude, open Settings → Connectors → Add custom connector.
          </li>
          <li>2. Name it Advantage and paste this address:</li>
        </ol>
        <CopyField value={mcpUrl} />
        <ol
          start={3}
          className="flex flex-col gap-1.5 text-[12px] text-[var(--ink-700)]"
        >
          <li>3. Press Connect, sign in here, and choose Allow.</li>
        </ol>
        <div className="flex flex-col gap-1.5 pt-1">
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--ink-500)]">
            <Terminal className="size-3" strokeWidth={1.5} aria-hidden="true" />
            In Claude Code
          </span>
          <CopyField
            value={`claude mcp add --transport http advantage ${mcpUrl}`}
          />
        </div>
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
 * sessions at once and the person has to approve it again in Claude, the
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
          className="mt-0.5 text-[11px] text-[var(--ink-500)]"
          suppressHydrationWarning
        >
          {confirming
            ? `${grant.name} loses access now; you would approve it again in Claude.`
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
