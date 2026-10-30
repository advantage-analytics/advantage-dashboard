/**
 * The Pilot card's three server actions, stood in for in the browser bundle
 * `tests/pilot-usage-card.spec.ts` drives. A server action cannot be bundled,
 * so these answer `{ ok: true }` — or, while the spec has set
 * `window.__pilotActionsFail`, reject the way Safari's `fetch` does when the
 * connection drops mid-request (`TypeError: Load failed`).
 */
declare global {
  interface Window {
    __pilotActionsFail?: boolean;
  }
}

type Outcome = { ok: true } | { ok: false; error: string };

async function answer(): Promise<Outcome> {
  await new Promise((done) => setTimeout(done, 20));
  if (window.__pilotActionsFail) throw new TypeError("Load failed");
  return { ok: true };
}

export async function adminSetPilotEnd(_input: {
  programId: string;
  endsOn: string;
}): Promise<Outcome> {
  return answer();
}

export async function adminEndPilot(_programId: string): Promise<Outcome> {
  return answer();
}

export async function adminSetPilotEligible(_input: {
  programId: string;
  eligible: boolean;
}): Promise<Outcome> {
  return answer();
}
