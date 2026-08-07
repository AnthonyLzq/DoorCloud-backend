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
COPY turbo.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS build

# Full source so the turbo graph can order shared -> backend -> web.
COPY . .

# CD-4: build the workspace through the turbo task graph (shared first). The
# backend and web consumers resolve @doorcloud/shared's built dist.
RUN pnpm exec turbo run build

FROM base AS production

ENV NODE_ENV=production
ENV NODE_PATH=/app/apps/backend/dist

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./
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

# CD-3: dist-root lock. The runtime paths resolve from the compiled module
# directory (dist/config/paths.js), so WORKDIR must be the compiled dist root
# and the entrypoint runs `node index.js`. `node dist/index.js` from a dist
# WORKDIR would resolve to /app/apps/backend/dist/dist/index.js (nonexistent).
WORKDIR /app/apps/backend/dist

# CD-1/CD-3: liveness healthcheck wired to /healthz. node -e keeps the image
# free of a curl layer.
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:1996/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# CD-2: the backend handles SIGTERM (graceful drain then exit 0). pnpm start
# keeps signal handling: exec into node so PID 1 is the app process.
CMD ["node", "index.js"]