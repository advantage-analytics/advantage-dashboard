/**
 * Everything this deployment needs before a vendor submission can possibly
 * succeed.
 *
 * Checked once, up front, rather than at the three depths these used to sit
 * at — webhook URL after two lookups, vendor credentials after quota was
 * already reserved, storage config deeper still inside mint(). On a deployment
 * missing any of them, every attempt burned a job lookup, a match lookup, and
 * a full reserve-then-release cycle before discovering it could never have
 * worked.
 *
 * Lived inside api/splitstep/jobs/route.ts until resubmission
 * (resubmit-job.ts) needed the identical preflight; extracted rather than
 * copied so the two callers cannot drift on what "configured" means.
 */

import { resolveWebhookUrl } from './config';
import { resolveAzureStorageConfig } from './video-url';

export type SplitstepVendorApiConfig =
  | { ok: true; apiUrl: string; apiKey: string }
  | { ok: false; missing: string };

/**
 * Just the two things a call TO the vendor's status endpoint needs.
 *
 * Split out for the reconciler: polling `GET /jobs/{id}` needs neither a
 * webhook URL (nothing calls back) nor Azure storage (nothing is minted). The
 * full resolver below used to be the reconciler's only option, which meant an
 * unset `NEXT_PUBLIC_SITE_URL` or an incomplete Azure config — irrelevant to
 * polling — silently stopped status reconciliation from running at all.
 */
export function resolveSplitstepVendorApiConfig(): SplitstepVendorApiConfig {
  const apiUrl = process.env.SPLITSTEP_API_URL;
  const apiKey = process.env.SPLITSTEP_API_KEY;

  // The published vendor client still points at api.example.com; refuse rather
  // than POST a real job at a placeholder host.
  if (!apiUrl || apiUrl.includes('api.example.com')) {
    return {
      ok: false,
      missing: 'SPLITSTEP_API_URL (absent, or still the placeholder)',
    };
  }
  if (!apiKey) {
    return { ok: false, missing: 'SPLITSTEP_API_KEY' };
  }
  return { ok: true, apiUrl, apiKey };
}

export type SplitstepDeploymentConfig =
  | { ok: true; webhookUrl: string; apiUrl: string; apiKey: string }
  | { ok: false; missing: string };

/**
 * Everything a SUBMISSION needs — the vendor API config above, plus a
 * callback URL and complete Azure storage. Use this for anything that talks
 * to the vendor about a job (submit, resubmit); use the narrower
 * `resolveSplitstepVendorApiConfig()` for anything that only reads status.
 */
export function resolveSplitstepDeploymentConfig(): SplitstepDeploymentConfig {
  const webhookUrl = resolveWebhookUrl();
  if (!webhookUrl) {
    return {
      ok: false,
      missing: 'NEXT_PUBLIC_SITE_URL (absent, or points at localhost)',
    };
  }

  const vendorApi = resolveSplitstepVendorApiConfig();
  if (!vendorApi.ok) return vendorApi;

  // createVideoUrlStrategy() throws on incomplete storage config —
  // synchronously, deep inside the submit path. Catch it here where it can
  // still be a clean refusal.
  const storage = resolveAzureStorageConfig();
  if (!storage.ok) {
    return { ok: false, missing: storage.missing };
  }

  return { ok: true, webhookUrl, apiUrl: vendorApi.apiUrl, apiKey: vendorApi.apiKey };
}
