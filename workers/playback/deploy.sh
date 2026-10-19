#!/usr/bin/env bash
# Create (or update) the Azure side of the playback worker. Idempotent: every
# step checks or uses create-or-update, so re-running after a change is safe.
#
#   IMAGE=<registry>/playback-worker:<tag> \
#   PLAYBACK_CALLBACK_SECRET=<same value as in Vercel> \
#     workers/playback/deploy.sh
#
# Needs `az login` as someone who can create resources and assign roles in the
# resource group. Never an account key: the job runs as its own user-assigned
# identity with exactly these roles on the storage account —
#   Storage Blob Data Contributor   read videos/, write playback/, and the
#                                   user-delegation key ffmpeg's read SAS needs
#   Storage Queue Data Message Processor + Reader   take and delete messages;
#                                   KEDA reads the queue length
#
# What it creates, all in Canada East next to the storage (no egress):
#   queue        playback                       on the storage account
#   event grid   system topic on the account, subscription: BlobCreated under
#                advantage-videos/videos/ (committed blobs only) → the queue
#   identity     playback-worker
#   environment  playback-env (Consumption, logs off)
#   job          playback-worker — event-triggered by the queue, 4 vCPU / 8 GiB,
#                4 h replica timeout, one message per execution, ≤3 at once
#
# Cost at today's scale: inside Container Apps' monthly free grant (about 16
# hours of 4 vCPU), Event Grid's first 100k operations and queue pennies.
set -euo pipefail

: "${IMAGE:?set IMAGE to the pushed worker image}"
: "${PLAYBACK_CALLBACK_SECRET:?set PLAYBACK_CALLBACK_SECRET}"
RG="${RG:-advantage-dashboard}"
LOC="${LOC:-canadaeast}"
ACCT="${ACCT:-advantagedashboardca}"
CONT="${CONT:-advantage-videos}"
QUEUE="${QUEUE:-playback}"
ENV_NAME="${ENV_NAME:-playback-env}"
JOB="${JOB:-playback-worker}"
IDENTITY="${IDENTITY:-playback-worker}"
TOPIC="${TOPIC:-${ACCT}-events}"
CALLBACK_URL="${CALLBACK_URL:-https://app.advantage-analytics.com/api/webhooks/playback}"
# Set when IMAGE lives in a private registry the identity can pull from.
REGISTRY_SERVER="${REGISTRY_SERVER:-}"

step() { printf '\n== %s\n' "$*"; }

step "resource providers"
for ns in Microsoft.App Microsoft.EventGrid; do
  az provider register --namespace "$ns" --wait -o none
done
az extension add --name containerapp --upgrade -y -o none 2>/dev/null || true

ACCT_ID="$(az storage account show -n "$ACCT" -g "$RG" --query id -o tsv)"

step "queue $QUEUE"
az storage queue create --name "$QUEUE" --account-name "$ACCT" --auth-mode login -o none

step "identity $IDENTITY"
az identity create -g "$RG" -n "$IDENTITY" -l "$LOC" -o none
ID_ID="$(az identity show -g "$RG" -n "$IDENTITY" --query id -o tsv)"
ID_CLIENT="$(az identity show -g "$RG" -n "$IDENTITY" --query clientId -o tsv)"
ID_PRINCIPAL="$(az identity show -g "$RG" -n "$IDENTITY" --query principalId -o tsv)"
for role in "Storage Blob Data Contributor" "Storage Queue Data Message Processor" "Storage Queue Data Reader"; do
  if [[ -z "$(az role assignment list --assignee "$ID_PRINCIPAL" --scope "$ACCT_ID" --role "$role" --query '[0].id' -o tsv)" ]]; then
    az role assignment create --assignee-object-id "$ID_PRINCIPAL" --assignee-principal-type ServicePrincipal \
      --role "$role" --scope "$ACCT_ID" -o none
  fi
done
if [[ -n "$REGISTRY_SERVER" ]]; then
  ACR_ID="$(az acr show -n "${REGISTRY_SERVER%%.*}" --query id -o tsv)"
  if [[ -z "$(az role assignment list --assignee "$ID_PRINCIPAL" --scope "$ACR_ID" --role AcrPull --query '[0].id' -o tsv)" ]]; then
    az role assignment create --assignee-object-id "$ID_PRINCIPAL" --assignee-principal-type ServicePrincipal \
      --role AcrPull --scope "$ACR_ID" -o none
  fi
fi

step "event grid → queue"
if ! az eventgrid system-topic show -g "$RG" -n "$TOPIC" -o none 2>/dev/null; then
  az eventgrid system-topic create -g "$RG" -n "$TOPIC" -l "$LOC" \
    --topic-type Microsoft.Storage.StorageAccounts --source "$ACCT_ID" -o none
fi
az eventgrid system-topic event-subscription create -g "$RG" --system-topic-name "$TOPIC" \
  --name playback-uploads \
  --endpoint-type storagequeue --endpoint "$ACCT_ID/queueservices/default/queues/$QUEUE" \
  --included-event-types Microsoft.Storage.BlobCreated \
  --subject-begins-with "/blobServices/default/containers/$CONT/blobs/videos/" \
  --advanced-filter data.api StringIn PutBlockList PutBlob CopyBlob \
  --max-delivery-attempts 10 -o none

step "environment $ENV_NAME"
if ! az containerapp env show -g "$RG" -n "$ENV_NAME" -o none 2>/dev/null; then
  az containerapp env create -g "$RG" -n "$ENV_NAME" -l "$LOC" --logs-destination none -o none
fi

step "job $JOB"
common=(
  --image "$IMAGE" --cpu 4 --memory 8Gi
  --replica-timeout 14400 --replica-retry-limit 1
  --replica-completion-count 1 --parallelism 1
  --min-executions 0 --max-executions 3 --polling-interval 60
  --scale-rule-name queue --scale-rule-type azure-queue
  --scale-rule-metadata "accountName=$ACCT" "queueName=$QUEUE" "queueLength=1"
  --scale-rule-identity "$ID_ID"
  --secrets "callback-secret=$PLAYBACK_CALLBACK_SECRET"
  --env-vars "AZURE_CLIENT_ID=$ID_CLIENT" "STORAGE_ACCOUNT=$ACCT" "STORAGE_CONTAINER=$CONT"
    "QUEUE_NAME=$QUEUE" "CALLBACK_URL=$CALLBACK_URL" "PLAYBACK_CALLBACK_SECRET=secretref:callback-secret"
)
if az containerapp job show -g "$RG" -n "$JOB" -o none 2>/dev/null; then
  az containerapp job update -g "$RG" -n "$JOB" --image "$IMAGE" \
    --replace-env-vars "AZURE_CLIENT_ID=$ID_CLIENT" "STORAGE_ACCOUNT=$ACCT" "STORAGE_CONTAINER=$CONT" \
      "QUEUE_NAME=$QUEUE" "CALLBACK_URL=$CALLBACK_URL" "PLAYBACK_CALLBACK_SECRET=secretref:callback-secret" -o none
  az containerapp job secret set -g "$RG" -n "$JOB" --secrets "callback-secret=$PLAYBACK_CALLBACK_SECRET" -o none
else
  registry=()
  [[ -n "$REGISTRY_SERVER" ]] && registry=(--registry-server "$REGISTRY_SERVER" --registry-identity "$ID_ID")
  az containerapp job create -g "$RG" -n "$JOB" --environment "$ENV_NAME" \
    --trigger-type Event --mi-user-assigned "$ID_ID" "${registry[@]}" "${common[@]}" -o none
fi

step "done"
echo "Queue a backfill item:  az storage message put --account-name $ACCT --queue-name $QUEUE --auth-mode login --content '{\"blob\":\"videos/<uid>/<match>/original.mp4\"}'"
echo "Watch executions:       az containerapp job execution list -g $RG -n $JOB -o table"
