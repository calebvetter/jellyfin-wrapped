# syntax=docker/dockerfile:1.7
#
# Jellyfin Wrapped — single-container image.
# The app is compiled once on the build host's native platform (output is plain JS);
# per-platform stages only install pure-JS runtime dependencies, so multi-arch builds
# (linux/amd64 + linux/arm64) stay fast without emulated compilation.
# SQLite comes from Node's built-in node:sqlite module — no native addons.

ARG NODE_VERSION=24-alpine
ARG PNPM_VERSION=10.34.7

# ---------------------------------------------------------------- build (native)
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION} AS build
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION} --no-audit --no-fund
WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY . .
ENV NODE_ENV=production
RUN pnpm exec svelte-kit sync && pnpm build

# ---------------------------------------------------------------- runtime deps (target platform)
FROM node:${NODE_VERSION} AS deps
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION} --no-audit --no-fund
WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc ./
# node-linker=hoisted gives a flat, self-contained node_modules that can be copied as-is
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts --config.node-linker=hoisted

# ---------------------------------------------------------------- runtime
FROM node:${NODE_VERSION}
LABEL org.opencontainers.image.title="Jellyfin Wrapped" \
      org.opencontainers.image.description="A Spotify Wrapped-style year in review for Jellyfin users" \
      org.opencontainers.image.licenses="MIT"

RUN apk add --no-cache tini python3

# yt-dlp (+ yt-dlp-ejs for YouTube) for the admin "grab audio from YouTube" feature.
# It uses this image's Node as its JavaScript runtime. Rebuild the image to update it
# (CI rebuilds weekly, since YouTube changes often).
RUN python3 -m venv /opt/yt-dlp \
    && /opt/yt-dlp/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/yt-dlp/bin/pip install --no-cache-dir "yt-dlp[default]" \
    && ln -s /opt/yt-dlp/bin/yt-dlp /usr/local/bin/yt-dlp \
    && yt-dlp --version

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    MOCK_PREVIEW=false \
    BODY_SIZE_LIMIT=16M

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/build ./build
COPY --chown=node:node package.json ./

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "build/index.js"]
