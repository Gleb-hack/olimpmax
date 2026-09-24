FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
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

FROM caddy:2-alpine AS web
COPY --from=build /app/apps/web/dist /srv/olimp
COPY deploy/Caddyfile /etc/caddy/Caddyfile
