# glibc base: onnxruntime-node ships glibc-only prebuilt binaries, so the
# musl-based Alpine image cannot dlopen libonnxruntime at boot (ERR_DLOPEN).
FROM node:22-bookworm-slim AS base

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable \
  && corepack prepare pnpm@10.30.1 --activate

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS build

# @doorcloud/shared first: the backend imports its BUILT dist (D10)
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src

RUN pnpm --filter @doorcloud/shared build

COPY apps/backend/tsconfig.json apps/backend/tsconfig.base.json ./apps/backend/
COPY apps/backend/src ./apps/backend/src

RUN pnpm --filter @doorcloud/backend build

# D7: the Preact SPA (hash routing) is served by the backend at / and /setup
COPY apps/web/package.json apps/web/tsconfig.json apps/web/vite.config.ts \
  apps/web/index.html ./apps/web/
COPY apps/web/src ./apps/web/src

RUN pnpm --filter @doorcloud/web build

FROM base AS production

ENV NODE_ENV=production
ENV NODE_PATH=/app/apps/backend/dist

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY apps/backend/scripts/face_recognition_server.py \
  ./apps/backend/scripts/face_recognition_server.py
COPY apps/backend/requirements.txt ./apps/backend/requirements.txt

WORKDIR /app/apps/backend

CMD ["pnpm", "start"]
