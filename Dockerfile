# Olimp: API, MAX bot and the Mini App behind Caddy. Targets: api, bot, web (see compose.yaml).
# Type checks and tests run in CI and `pnpm check`; the image build only bundles the code.

FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN npm install --global pnpm@11.25.0

# Dependencies change rarely: this layer is reused while the manifests and the lock file stay the same.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/bot/package.json apps/bot/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

# API, bot and the database setup (migrations + catalog import run with tsx from the sources and data/).
FROM deps AS server
COPY . .
RUN pnpm build:server && mkdir -p /app/data && chown -R node:node /app/data
ENV NODE_ENV=production
USER node

FROM server AS api
EXPOSE 3001
CMD ["node", "apps/api/dist/server.js"]

# MAX bot: commands, buttons and reminders. Long polling, no public port.
# The Russian Trusted Root CA lets the bot reach platform-api2.max.ru over HTTPS (slim images lack it).
FROM server AS bot
ENV NODE_EXTRA_CA_CERTS=/app/deploy/russiantrustedca.crt
CMD ["node", "apps/bot/dist/main.js"]

FROM deps AS web-build
COPY . .
ENV VITE_DATA_MODE=api VITE_DEV_AUTH=false VITE_API_URL=/api
RUN pnpm build:web

# Static Mini App and the /api/* proxy. SITE_ADDRESS: ":80" locally, the domain (automatic HTTPS) in production.
FROM caddy:2-alpine AS web
COPY --from=web-build /app/apps/web/dist /srv/olimp
COPY deploy/Caddyfile /etc/caddy/Caddyfile
