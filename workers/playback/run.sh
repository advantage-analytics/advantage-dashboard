#!/usr/bin/env bash
# The playback worker: one upload in, one playback copy out.
#
# Runs as an Azure Container Apps job execution, started by KEDA when the
# `playback` storage queue has a message. Event Grid puts a BlobCreated event
# there for every blob committed under videos/; a backfill puts
# {"blob":"videos/..."} by hand. One execution takes one message.
#
# The copy (playback/<uid>/<match>/<name>.mp4) is what both players prefer
# (match-video-choice.ts): index first, H.264 yuv420p ≤1080p, AAC, a keyframe
# at least every ~2 s, on the upload's own timeline so points.video_time needs
# no offset. Measured 2026-10-19 across 33 uploads: most already are that
# file with the index at the END, so they are remuxed (no re-encode, about a
# minute); the rest — the camera's original bitrate, HEVC, 4K, keyframes 5–10 s
# apart — are re-encoded. Either way the copy must show the same video start
# time, frame count and duration as the upload, or nothing is uploaded.
#
# The upload itself is never touched. Results go to the app's
# /api/video/playback, signed with PLAYBACK_CALLBACK_SECRET (HMAC-SHA256 of
# the body, hex, in x-playback-signature), which writes processing_jobs.
#
# Environment: AZURE_CLIENT_ID (the job's user-assigned identity), STORAGE_ACCOUNT,
# STORAGE_CONTAINER, QUEUE_NAME, CALLBACK_URL, PLAYBACK_CALLBACK_SECRET.
set -euo pipefail

: "${STORAGE_ACCOUNT:?}" "${STORAGE_CONTAINER:?}" "${QUEUE_NAME:?}"
: "${CALLBACK_URL:?}" "${PLAYBACK_CALLBACK_SECRET:?}"
WORK="${WORK:-/tmp/playback}"
MAX_ATTEMPTS=3
# Remux only a file that already plays well: H.264 yuv420p ≤1080p, at most
# this bitrate, and keyframes no further apart than this.
REMUX_MAX_BITRATE=4500000
REMUX_MAX_KEYFRAME_GAP=2.6

log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
az_q() { az storage message "$@" --account-name "$STORAGE_ACCOUNT" --queue-name "$QUEUE_NAME" --auth-mode login; }
az_b() { az storage blob "$@" --account-name "$STORAGE_ACCOUNT" --container-name "$STORAGE_CONTAINER" --auth-mode login; }

callback() {
  local body sig
  body="$(jq -nc --arg source "$SOURCE" --arg status "$1" --arg playback "${DEST:-}" \
    --arg error "${2:-}" --arg mode "${MODE:-}" \
    'def blank: if . == "" then null else . end;
     {sourceKey:$source, status:$status, playbackKey:($playback|blank),
      error:($error|blank), mode:($mode|blank)}')"
  sig="$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$PLAYBACK_CALLBACK_SECRET" -hex | awk '{print $NF}')"
  curl -fsS -X POST "$CALLBACK_URL" -H 'content-type: application/json' \
    -H "x-playback-signature: $sig" --data "$body" -o /dev/null --max-time 30 \
    || log "callback ($1) failed"
}

az login --identity ${AZURE_CLIENT_ID:+--client-id "$AZURE_CLIENT_ID"} -o none

# Four hours unseen: longer than any encode, so a crash brings it back.
MSG="$(az_q get --visibility-timeout 14400 -o json)"
if [[ "$(jq 'length' <<<"$MSG")" == 0 ]]; then
  log "queue empty"
  exit 0
fi
MSG_ID="$(jq -r '.[0].id' <<<"$MSG")"
POP="$(jq -r '.[0].popReceipt' <<<"$MSG")"
TRIES="$(jq -r '.[0].dequeueCount' <<<"$MSG")"
CONTENT="$(jq -r '.[0].content' <<<"$MSG")"
done_msg() { az_q delete --id "$MSG_ID" --pop-receipt "$POP" -o none || true; }

# Event Grid writes the event JSON base64-encoded; a backfill may write plain JSON.
jq -e . >/dev/null 2>&1 <<<"$CONTENT" || CONTENT="$(base64 -d <<<"$CONTENT")"
SOURCE="$(jq -r '.blob // .data.url // empty' <<<"$CONTENT")"
SOURCE="${SOURCE#https://"$STORAGE_ACCOUNT".blob.core.windows.net/"$STORAGE_CONTAINER"/}"
if [[ "$SOURCE" != videos/* ]]; then
  log "not an upload: $SOURCE"
  done_msg
  exit 0
fi
rest="${SOURCE#videos/}"
DEST="playback/${rest%.*}.mp4"
MODE=""
log "source $SOURCE → $DEST (attempt $TRIES)"

fail() {
  log "failed: $1"
  if (( TRIES >= MAX_ATTEMPTS )); then
    callback failed "$1"
    done_msg
  fi
  exit 1
}
trap 'fail "unexpected error on line $LINENO"' ERR

callback processing

# The upload comes to local disk first. Reading it over HTTP from ffmpeg
# stalled on long connect timeouts even inside the region — the backfill's
# large files spent hours reconnecting — while the CLI's download retries and
# reads in parallel. The replica's disk is 8 GiB: the largest upload (6.1 GB)
# plus its ≤4 Mbps re-encode still fits.
mkdir -p "$WORK"
SRC="$WORK/source"
rm -f "$SRC"
az_b download --name "$SOURCE" --file "$SRC" --max-connections 8 --no-progress -o none
URL="$SRC"

# What the upload is.
# One entry per call: ffprobe prints a section's fields in its own order.
probe_stream() {
  ffprobe -v error -select_streams v:0 -show_entries "stream=$1" -of csv=p=0 "$URL"
}
CODEC="$(probe_stream codec_name)"
PIXFMT="$(probe_stream pix_fmt)"
HEIGHT="$(probe_stream height)"
BITRATE="$(ffprobe -v error -show_entries format=bit_rate -of csv=p=0 "$URL")"
DURATION="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$URL")"
FPS="$(ffprobe -v error -select_streams v:0 -show_entries stream=avg_frame_rate -of csv=p=0 "$URL" | awk -F/ '{ if ($2>0) printf "%.3f", $1/$2; else print 30 }')"
MID="$(awk -v d="$DURATION" 'BEGIN { printf "%d", d / 2 }')"
GAP="$(ffprobe -v error -select_streams v:0 -read_intervals "${MID}%+30" \
  -show_entries packet=pts_time,flags -of csv=p=0 "$URL" \
  | awk -F, '$2 ~ /K/ { if (seen) { g = $1 - last; if (g > max) max = g } last = $1; seen = 1 } END { printf "%.2f", max + 0 }')"
log "codec=$CODEC pix=$PIXFMT h=$HEIGHT bitrate=$BITRATE fps=$FPS keyframe-gap=$GAP"

# yuvj420p is the same 4:2:0 at full range — what phones record — and plays
# everywhere yuv420p does.
if [[ "$CODEC" == h264 && ( "$PIXFMT" == yuv420p || "$PIXFMT" == yuvj420p ) ]] \
  && (( HEIGHT <= 1080 )) \
  && (( BITRATE <= REMUX_MAX_BITRATE )) \
  && awk -v g="$GAP" -v m="$REMUX_MAX_KEYFRAME_GAP" 'BEGIN { exit !(g > 0 && g <= m) }'; then
  MODE=remux
else
  MODE=transcode
fi

OUT="$WORK/out.mp4"
# The upload's own clock: an encoder on the default 1/fps grid rounds a
# phone's variable timestamps by up to half a frame (the first 60 fps
# re-encodes failed the timeline check), so encode and mux on the source's.
TIMESCALE="$(probe_stream time_base | awk -F/ '{ print $2 }')"

encode() {
  rm -f "$OUT"
  if [[ "$MODE" == remux ]]; then
    ffmpeg -nostdin -v error -y -i "$URL" -map 0:v:0 -map '0:a:0?' -c copy \
      -movflags +faststart "$OUT"
  else
    # At most 4 Mbps at 1080p30 (5 at 60 fps), and never much above the
    # upload's own rate: a 0.7 Mbps upload re-encoded only for its keyframes
    # came out twice its size uncapped. A keyframe every 2 s by time, so
    # variable-frame-rate phone footage keeps its own timestamps.
    local ceiling=4000000 maxrate
    if awk -v f="$FPS" 'BEGIN { exit !(f > 40) }'; then ceiling=5000000; fi
    maxrate="$(awk -v s="$BITRATE" -v c="$ceiling" 'BEGIN { m = s * 1.2; if (m < 1000000) m = 1000000; if (m > c) m = c; printf "%d", m }')"
    ffmpeg -nostdin -v error -y -i "$URL" -map 0:v:0 -map '0:a:0?' \
      -c:v libx264 -preset veryfast -profile:v high -pix_fmt yuv420p \
      -vf "scale=-2:'min(1080,ih)'" -crf 23 -maxrate "$maxrate" -bufsize "$((maxrate * 2))" \
      -force_key_frames 'expr:gte(t,n_forced*2)' -fps_mode passthrough \
      -enc_time_base:v demux -video_track_timescale "$TIMESCALE" \
      -c:a aac -b:a 128k -ac 2 -movflags +faststart "$OUT"
  fi
}

# Same timeline or nothing: every SHOWN video frame (presentation time ≥ 0 —
# an edit list hides pre-roll packets with negative times, which a copy may
# drop) at the same time to the millisecond, and the same duration. Times are
# compared in seconds because the two files' time bases differ.
shown_times() {
  ffprobe -v error -select_streams v:0 -show_entries packet=pts_time \
    -of csv=p=0 "$1" | awk '$1 != "N/A" && $1 >= 0' | sort -g
}
shown_times "$URL" >"$WORK/before.txt"
same_timeline() {
  local out_duration
  shown_times "$OUT" >"$WORK/after.txt"
  out_duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")"
  log "timeline: upload $(wc -l <"$WORK/before.txt") frames ${DURATION}s," \
    "copy $(wc -l <"$WORK/after.txt") frames ${out_duration}s"
  [[ "$(wc -l <"$WORK/before.txt")" == "$(wc -l <"$WORK/after.txt")" ]] \
    && paste "$WORK/before.txt" "$WORK/after.txt" \
      | awk '{ d = $1 - $2; if (d < 0) d = -d; if (d > 0.001) exit 1 }' \
    && awk -v a="$DURATION" -v b="$out_duration" 'BEGIN { d = a - b; if (d < 0) d = -d; exit !(d < 0.1) }'
}

encode
if ! same_timeline && [[ "$MODE" == remux ]]; then
  # A stream copy can gain an edit list that moves the start; an encode can't.
  MODE=transcode
  encode
fi
if ! same_timeline; then
  trap - ERR
  fail "timeline changed ($MODE)"
fi

az_b upload --name "$DEST" --file "$OUT" --overwrite --content-type video/mp4 \
  --max-connections 8 --no-progress -o none
rm -f "$OUT" "$SRC"
callback ready
done_msg
log "ready ($MODE)"
