# Tasks: P3 Operational Cleanup

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 300–500 (lint reformatting is the wildcard) |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Phase 1+2) → PR 2 (Phase 3+4) → PR 3 (Phase 5) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Release + HTTP security | PR 1 | `pnpm release -- --dry-run && pnpm test:local` | `curl -H "Origin: http://localhost:3000" -v http://localhost:1996/` | Revert `package.json` release script + `env.ts`/`server.ts` CORS changes |
| 2 | MQTT legacy removal + CI | PR 2 | `pnpm test:local && pnpm test:mqtt` | Mosquitto Docker via `scripts/mosquitto/run-integration-tests.sh` | Revert topics.ts, photo.ts, photoPayloads.ts, env.ts, aclfile, test.yml |
| 3 | Lint tooling (Biome) | PR 3 | `pnpm lint && pnpm typecheck` | N/A — lint-only change, no runtime harness needed | `git revert` to restore `.eslintrc` and ESLint deps |

## Phase 1: Release Tooling Migration

- [x] 1.1 Remove `standard-version` from `devDependencies` and `release` script in `package.json`; install `commit-and-tag-version`; update `release` script to `commit-and-tag-version`. Run `pnpm install`.
  - **Files**: `package.json`, `pnpm-lock.yaml`
  - **Tests**: `pnpm release -- --dry-run`
  - **Acceptance**: `standard-version` absent from `package.json`; `commit-and-tag-version` present; dry-run exits 0
  - **Depends on**: none

- [x] 1.2 Update `README.md` release section to reference `commit-and-tag-version` and `pnpm release`.
  - **Files**: `README.md`
  - **Tests**: visual review
  - **Acceptance**: README mentions `pnpm release` and Conventional Commits requirement
  - **Depends on**: 1.1

**Commit**: `chore: migrate release tooling from standard-version to commit-and-tag-version`

## Phase 2: HTTP Security Hardening

- [ ] 2.1 Add `CORS_ORIGINS` optional env var to `src/config/env.ts` — parse as comma-separated string, default to `undefined`. Add unit test in `test/index.test.ts` for `parseEnv` with/without `CORS_ORIGINS`.
  - **Files**: `src/config/env.ts`, `test/index.test.ts`
  - **Tests**: `pnpm test:local`
  - **Acceptance**: `parseEnv({})` returns `CORS_ORIGINS: undefined`; `parseEnv({CORS_ORIGINS:'http://a,https://b'})` returns `['http://a','https://b']`
  - **Depends on**: none

- [ ] 2.2 Configure CORS allowlist in `src/network/server.ts` — replace `cors, {}` with `cors, { origin: CORS_ORIGINS ?? true }`. Remove entire `preHandler` hook (x-powered-by + redundant CORS headers).
  - **Files**: `src/network/server.ts`
  - **Tests**: `pnpm test:local && pnpm typecheck`
  - **Acceptance**: No `x-powered-by` header in responses; CORS respects `CORS_ORIGINS`; unset `CORS_ORIGINS` allows all origins
  - **Depends on**: 2.1

- [ ] 2.3 Update `.env.example` and `README.md` to document `CORS_ORIGINS`.
  - **Files**: `.env.example`, `README.md`
  - **Tests**: visual review
  - **Acceptance**: `CORS_ORIGINS` documented with format and default behavior
  - **Depends on**: 2.1

**Commit**: `feat: restrict CORS with allowlist and remove x-powered-by header`

## Phase 3: MQTT Legacy Removal

- [ ] 3.1 Remove `MQTT_LEGACY_TOPICS_ENABLED` from `src/config/env.ts` (L96-99). Remove from `.env.example`.
  - **Files**: `src/config/env.ts`, `.env.example`
  - **Tests**: `pnpm test:local`
  - **Acceptance**: `parseEnv` no longer accepts `MQTT_LEGACY_TOPICS_ENABLED`; existing tests pass
  - **Depends on**: none

- [ ] 3.2 Remove legacy topic code from `src/network/mqtt/topics.ts` — delete `LEGACY_PHOTO_TOPIC_FILTER`, `isLegacyPhotoTopic`, `legacy` key from `MQTT_TOPICS.photo`; simplify `getPhotoSubscriptionTopics` (no parameter), `isPhotoSendTopic` and `isPhotoMetricsTopic` (no `legacyTopicsEnabled` param). Update exports.
  - **Files**: `src/network/mqtt/topics.ts`
  - **Tests**: `pnpm test:local && pnpm typecheck`
  - **Acceptance**: Only versioned topics exported; no `DoorCloud/photo` references; functions have simplified signatures
  - **Depends on**: 3.1

- [ ] 3.3 Remove legacy payload parsers from `src/network/mqtt/photoPayloads.ts` — delete `parseLegacyPhotoSendPayload`, `parseLegacyPhotoMetricsPayload` and their exports.
  - **Files**: `src/network/mqtt/photoPayloads.ts`
  - **Tests**: `pnpm test:local && pnpm typecheck`
  - **Acceptance**: Only `parsePhotoSendPayload` and `parsePhotoMetricsPayload` exported
  - **Depends on**: 3.1

- [ ] 3.4 Simplify `src/network/mqtt/routes/photo.ts` — remove legacy imports (`parseLegacyPhotoSendPayload`, `parseLegacyPhotoMetricsPayload`, `isLegacyPhotoTopic`); remove `MQTT_LEGACY_TOPICS_ENABLED` usage from `sub()`; simplify `getPhotoSendPayload`/`getPhotoMetricsPayload` to call versioned parsers directly; update `isPhotoSendTopic`/`isPhotoMetricsTopic` calls (no second arg).
  - **Files**: `src/network/mqtt/routes/photo.ts`
  - **Tests**: `pnpm test:local && pnpm typecheck`
  - **Acceptance**: No legacy references; `sub()` calls `getPhotoSubscriptionTopics()` with no args; message handler calls simplified topic checks
  - **Depends on**: 3.2, 3.3

- [ ] 3.5 Remove `DoorCloud/photo/#` lines from `infra/mosquitto/aclfile` (L4, L6, L10, L13).
  - **Files**: `infra/mosquitto/aclfile`
  - **Tests**: `pnpm test:mqtt` (if Mosquitto available)
  - **Acceptance**: No `DoorCloud/photo` entries in ACL file
  - **Depends on**: 3.4

- [ ] 3.6 Update `README.md` MQTT section — remove legacy topic references, document only `doorcloud/v1/photo/*`. Add `CHANGELOG.md` breaking change entry.
  - **Files**: `README.md`, `CHANGELOG.md`
  - **Tests**: visual review
  - **Acceptance**: README shows only versioned topics; CHANGELOG has breaking change notice
  - **Depends on**: 3.4

**Commit**: `feat!: remove legacy DoorCloud/photo/# MQTT topic support`

## Phase 4: CI Mosquitto Integration

- [ ] 4.1 Add `mqtt-integration` job to `.github/workflows/test.yml` — start Mosquitto via Docker Compose (`scripts/mosquitto/create-password-file.sh` + compose), wait for healthcheck, run `pnpm test:mqtt` with `MQTT_HOST=localhost`, `MQTT_PORT=1883`, `MQTT_PROTOCOL=mqtt`, `MQTT_USER`, `MQTT_PASS` env vars. Run in parallel with existing `test` job. Clean up containers on completion.
  - **Files**: `.github/workflows/test.yml`
  - **Tests**: push to branch and verify CI passes
  - **Acceptance**: `mqtt-integration` job appears in workflow; runs `pnpm test:mqtt`; passes on green; fails on red
  - **Depends on**: 3.5

**Commit**: `ci: add mqtt-integration job with Mosquitto Docker service`

## Phase 5: Lint Tooling Migration (Biome)

- [ ] 5.1 Install `@biomejs/biome`; create `biome.json` preserving current rules: `lineWidth: 80`, `quoteStyle: single`, `semicolons: asNeeded`, `indentStyle: space`, `indentWidth: 2`, `trailingCommas: none`, `arrowParentheses: asNeeded`, `bracketSpacing: true`, `objectShorthand: always`, `preferConst: error`, `curly: multi`. Remove ESLint/Prettier deps from `package.json`: `eslint`, `@babel/eslint-parser`, `@babel/preset-typescript`, `eslint-config-*`, `eslint-plugin-*`, `prettier`, `eslint-plugin-prettier`. Update scripts: `lint` → `biome check src/`, `lint:fix` → `biome check --write src/`, `format` → `biome format --write src/`.
  - **Files**: `package.json`, `biome.json`
  - **Tests**: `pnpm install && pnpm lint`
  - **Acceptance**: `biome.json` exists; ESLint deps removed; `pnpm lint` exits 0
  - **Depends on**: none

- [ ] 5.2 Delete `.eslintrc`. Run `pnpm lint:fix` to auto-format. Fix any remaining lint errors manually. Verify `pnpm typecheck` still passes.
  - **Files**: `.eslintrc` (delete), all `.ts` files (formatting adjustments)
  - **Tests**: `pnpm lint && pnpm typecheck`
  - **Acceptance**: `.eslintrc` absent; `pnpm lint` exits 0; `pnpm typecheck` exits 0
  - **Depends on**: 5.1

- [ ] 5.3 Update `.github/workflows/lint.yml` if needed (likely no changes — it runs `pnpm lint`). Update `README.md` lint section to document Biome.
  - **Files**: `.github/workflows/lint.yml` (verify), `README.md`
  - **Tests**: visual review + CI pass
  - **Acceptance**: README documents `pnpm lint`, `pnpm lint:fix`, `pnpm format` with Biome
  - **Depends on**: 5.2

**Commit**: `chore: migrate lint tooling from ESLint+Prettier to Biome`
