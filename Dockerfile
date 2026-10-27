# syntax=docker/dockerfile:1

# Targets: `prod` (compiled runtime) and `dev` (watch mode, used by docker-compose.yml).
# `dev` stays last so a plain `docker build .` keeps producing the development image.

ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS base

WORKDIR /usr/src/app

FROM base AS deps

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS build

COPY . .
RUN npm run build

FROM base AS prod-deps

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --omit=optional

FROM base AS prod

ENV NODE_ENV=production
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

COPY package.json ./
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist

USER node

EXPOSE 3000

# Liveness, not readiness: a PostgreSQL outage must not mark the process unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=5s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/health/live`).then((res) => process.exit(res.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "dist/main.js"]

FROM deps AS dev

ENV NODE_ENV=development

COPY . .

EXPOSE 3000

CMD ["npm", "run", "start:dev"]
