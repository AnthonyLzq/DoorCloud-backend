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

RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY apps/backend/tsconfig.json apps/backend/tsconfig.base.json ./apps/backend/
COPY apps/backend/src ./apps/backend/src

RUN pnpm --filter @doorcloud/backend build

FROM base AS production

ENV NODE_ENV=production
ENV NODE_PATH=/app/apps/backend/dist

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/package.json

RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY apps/backend/scripts/face_recognition_server.py \
  ./apps/backend/scripts/face_recognition_server.py
COPY apps/backend/requirements.txt ./apps/backend/requirements.txt

WORKDIR /app/apps/backend

CMD ["pnpm", "start"]
