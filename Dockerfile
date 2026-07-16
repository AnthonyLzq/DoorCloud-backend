FROM node:22-alpine3.23 AS base

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apk upgrade --no-cache \
  && corepack enable \
  && corepack prepare pnpm@10.30.1 --activate

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY tsconfig.base.json tsconfig.json ./
COPY src ./src

RUN pnpm build

FROM base AS production

ENV NODE_ENV=production
ENV NODE_PATH=/app/dist

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist

CMD ["pnpm", "start"]
