/**
 * The server actions the Ask page reaches, for its browser harness. Alias
 * both specifiers to this file:
 *
 * - `@/app/dashboard/ask/actions` — `"use server"`, pulls the server
 *   Supabase client into the bundle. Each call is recorded on `window` and
 *   answers as the real one would on success.
 * - `@/app/dashboard/matches/(detail)/[matchId]/saved-views-actions` —
 *   the same, for "Save as a view".
 */
declare global {
  interface Window {
    askActionCalls?: { name: string; args: unknown[] }[];
  }
}

function record(name: string, ...args: unknown[]) {
  (window.askActionCalls ??= []).push({ name, args });
}

const params = () => new URLSearchParams(window.location.search);

export async function deleteAskConversation(...args: unknown[]) {
  record("deleteAskConversation", ...args);
  return { ok: true as const };
}

export async function renameAskConversation(...args: unknown[]) {
  record("renameAskConversation", ...args);
  return { ok: true as const };
}

export async function setAskConversationPinned(...args: unknown[]) {
  record("setAskConversationPinned", ...args);
  return { ok: true as const };
}

export async function pinAskAnswer(...args: unknown[]) {
  record("pinAskAnswer", ...args);
  if (params().get("pin") === "fail") {
    return { ok: false as const, error: "no_visual" as const };
  }
  return {
    ok: true as const,
    pinId: "pin-00000000-0000-4000-8000-000000000001",
  };
}

export async function unpinAskAnswer(...args: unknown[]) {
  record("unpinAskAnswer", ...args);
  return { ok: true as const };
}

export async function createSavedView(input: {
  name: string;
  cut: string;
  chart: string;
  filters: unknown;
}) {
  record("createSavedView", input);
  if (params().get("view") === "duplicate") {
    return { ok: false as const, error: "duplicate_name" as const };
  }
  return {
    ok: true as const,
    data: {
      id: "view-1",
      name: input.name,
      cut: input.cut,
      chart: input.chart,
      filters: input.filters,
      order: 0,
    },
  };
}
