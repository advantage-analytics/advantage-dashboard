---
name: azure-storage
description: Inspect, download or delete match video in Azure Blob Storage using the `az` CLI. Use when checking whether a match's video landed, chasing a stuck Advantage Intelligence job, measuring what a match is costing in storage, or cleaning up orphaned blobs. Replaces the azure-mcp-server MCP.
---

# Azure Blob Storage — match video

This repo touches exactly **one** Azure service: Blob Storage, holding source
and trimmed match video for the Advantage Intelligence pipeline. It was
previously reachable through `azure-mcp-server`, which loaded ~70 tools
(`aks`, `cosmos`, `kusto`, `redis`, `sql`, `acr`, …) into every session's
context for one service's worth of use. This skill costs one line until invoked.

## Auth — do not use the account key

```bash
az login                     # once per machine
az account show --query name -o tsv
```

Every command below passes `--auth-mode login`, which uses your signed-in
identity. **Never pass `--account-key`**: `AZURE_STORAGE_KEY` lives in
`.env.local`, which `.claude/hooks/guard-secrets.sh` denies reading on purpose,
and a key echoed into a terminal ends up in the transcript. If a command fails
with an authorization error, the fix is an RBAC role assignment
(`Storage Blob Data Contributor`) on the account, not a key.

## Layout

|           |                                                                              |
| --------- | ---------------------------------------------------------------------------- |
| Account   | `AZURE_STORAGE_ACCOUNT` (Canada East)                                        |
| Container | `AZURE_STORAGE_CONTAINER` — `advantage-videos`                               |
| Blob name | `{userId}/{matchId}/{filename}` — the match id is the **third** path segment |

That layout is what `scripts/cleanup-orphan-storage.ts` keys on, and it survived
the move off Cloudflare R2 because `videoObjectKey()` still produces it. Do not
change it casually.

## Recipes

Set the account once per shell (the container name is not a secret):

```bash
ACCT=<storage-account-name>; CONT=advantage-videos
```

**Everything stored for one match**

```bash
az storage blob list --account-name "$ACCT" --container-name "$CONT" \
  --prefix "$USER_ID/$MATCH_ID/" --auth-mode login \
  --query "[].{name:name, mb:properties.contentLength, modified:properties.lastModified}" -o table
```

**Did a specific video land, and how big is it**

```bash
az storage blob exists --account-name "$ACCT" --container-name "$CONT" \
  --name "$BLOB" --auth-mode login -o tsv
az storage blob show --account-name "$ACCT" --container-name "$CONT" \
  --name "$BLOB" --auth-mode login --query "properties.contentLength" -o tsv
```

**The largest blobs — what is actually costing money**

```bash
az storage blob list --account-name "$ACCT" --container-name "$CONT" \
  --auth-mode login --query "reverse(sort_by([].{n:name, b:properties.contentLength}, &b))[:20]" -o table
```

**Download one for inspection**

```bash
az storage blob download --account-name "$ACCT" --container-name "$CONT" \
  --name "$BLOB" --auth-mode login --file /tmp/probe.mp4
```

Source videos run **1–8 GB**. Check `contentLength` before downloading, and
write to a scratch directory, never into the repo.

## Deleting

Deletion is destructive and these blobs are the expensive ones. **Prefer the
repo's own script**, which only removes blobs whose match no longer exists and
dry-runs by default:

```bash
npx tsx scripts/cleanup-orphan-storage.ts            # dry run — start here
npx tsx scripts/cleanup-orphan-storage.ts --apply
```

Reach for `az storage blob delete` only for a single blob you have identified by
hand, and confirm with the user first. A match whose video is deleted while its
job is still running fails in a way the UI reports as a vendor error.

## Related

- `docs/video-pipeline-overview.md` — current state of the pipeline, SAS URLs, quota, deletion
- `src/lib/services/splitstep/video-url/azure-sas.ts` — how the app signs vendor URLs
- `@azure/storage-blob` is a `serverExternalPackage`; it must never reach a client bundle
