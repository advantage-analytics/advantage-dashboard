# The playback worker (run.sh): ffmpeg, the Azure CLI, jq and curl.
# Build for the Container Apps job (linux/amd64):
#   docker build --platform linux/amd64 -t <registry>/playback-worker:<tag> workers/playback
FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg jq curl ca-certificates openssl \
  && curl -sL https://aka.ms/InstallAzureCLIDeb | bash \
  && rm -rf /var/lib/apt/lists/*

COPY run.sh /usr/local/bin/run.sh
RUN chmod +x /usr/local/bin/run.sh

ENTRYPOINT ["/usr/local/bin/run.sh"]
