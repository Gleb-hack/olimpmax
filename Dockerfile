FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/bot/package.json apps/bot/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile
COPY . .
ENV VITE_DATA_MODE=api VITE_DEV_AUTH=false VITE_API_URL=/api
RUN pnpm build

FROM build AS api
ENV NODE_ENV=production
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/server.js"]

# MAX bot: commands, buttons and the daily reminder mailing. Long polling, no public port.
# The Russian Trusted Root CA is bundled and pointed at with NODE_EXTRA_CA_CERTS so the bot
# can reach platform-api2.max.ru over HTTPS. slim images have no update-ca-certificates.
FROM build AS bot
ENV NODE_ENV=production
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/russiantrustedca.crt
COPY deploy/russiantrustedca.crt /usr/local/share/ca-certificates/russiantrustedca.crt
CMD ["node", "apps/bot/dist/main.js"]

FROM caddy:2-alpine AS web
COPY --from=build /app/apps/web/dist /srv/olimp
COPY deploy/Caddyfile /etc/caddy/Caddyfile
