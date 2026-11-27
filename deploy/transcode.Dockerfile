# One-shot transcoding tool: docker compose run --rm transcode ...
# Ships FFmpeg/ffprobe so the host needs nothing but Docker.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY scripts ./scripts
ENTRYPOINT ["node", "scripts/transcode.mjs"]
