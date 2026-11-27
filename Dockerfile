FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
RUN node scripts/build-desktop.mjs && node scripts/prepare-desktop.mjs

FROM node:22-bookworm-slim AS web
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3100 LUMIERE_DATA_DIR=/data
WORKDIR /app
RUN mkdir /data && chown node:node /data
COPY --from=build --chown=node:node /app/.next/standalone ./
USER node
EXPOSE 3100
CMD ["node", "server.js"]

FROM dependencies AS worker
RUN npx playwright install --with-deps chromium && chmod -R a+rX /root/.cache/ms-playwright && mv /root/.cache/ms-playwright /ms-playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright NODE_ENV=production MEDIA_WORKER_PORT=3200
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node scrapers ./scrapers
USER node
EXPOSE 3200
CMD ["node", "scripts/media-worker.mjs"]
