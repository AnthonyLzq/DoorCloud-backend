# Archive Report: p3-operational-cleanup

| Field | Value |
|-------|-------|
| Change | p3-operational-cleanup |
| Archived to | `openspec/changes/archive/2026-07-16-p3-operational-cleanup/` |
| Archived on | 2026-07-17 |
| Verdict | PASS WITH WARNINGS (all warnings resolved at archive time) |
| Tasks | 15/15 complete |
| Phases | 5/5 implemented + 1 follow-up cleanup |

## What Was Accomplished

P3 Operational Cleanup was a cross-cutting modernization change that retired legacy tooling, removed deprecated MQTT topic support, hardened HTTP security defaults, and upgraded CI to run MQTT integration tests against a real Mosquitto broker.

### Phase 1 — Release Tooling Migration
Replaced the unmaintained `standard-version` with `commit-and-tag-version`. Updated `package.json` release script, lockfile, and README.

### Phase 2 — HTTP Security Hardening
Added a `CORS_ORIGINS` environment variable that parses a comma-separated allowlist. When unset, CORS remains permissive (`origin: true`) for local dev. Removed the custom `preHandler` hook that injected a redundant `x-powered-by` header and manual `Access-Control-*` headers — Fastify's `@fastify/cors` now handles CORS natively.

### Phase 3 — MQTT Legacy Topic Removal
Removed all support for the legacy `DoorCloud/photo/#` topic filter and the `MQTT_LEGACY_TOPICS_ENABLED` feature flag. Functions `getPhotoSubscriptionTopics`, `isPhotoSendTopic`, `isPhotoMetricsTopic`, and the payload parsers were simplified to their versioned-only signatures. The Mosquitto ACL file was pruned of `DoorCloud/photo` entries. A `BREAKING CHANGES` entry was added to `CHANGELOG.md`.

### Phase 4 — CI Mosquitto Integration
Added a new `mqtt-integration` job to `.github/workflows/test.yml` that starts Mosquitto via Docker Compose, waits for its healthcheck, runs `pnpm test:mqtt` with the correct env vars, and cleans up Docker resources on completion. Runs in parallel with the existing `test` job.

### Phase 5 — Lint Tooling Migration (ESLint + Prettier → Biome)
Replaced the ESLint + Prettier toolchain with Biome 2.5.4. Created `biome.json` preserving the project's formatting rules (80-char lines, single quotes, no semicolons, 2-space indent, trailing commas off, etc.). Removed `.eslintrc` and all ESLint/Prettier dependencies. Reformatted all source files.

### Follow-up Cleanup
Removed stale `// eslint-disable-next-line` / `// eslint-disable-line` comments from 3 source files, pruned `.eslintrc` / `.eslintignore` references from `.dockerignore`, and removed the stale `MQTT_LEGACY_TOPICS_ENABLED` line from the README credentials block.

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| **Biome over ESLint + Prettier** | Single tool for lint + format, native TypeScript 7 support, ~10–100× faster, no plugin matrix. Tradeoff: fewer community rules than ESLint, but sufficient for this codebase. |
| **commit-and-tag-version over standard-version** | `standard-version` is unmaintained (last release 2022). `commit-and-tag-version` is a maintained fork with the same CLI surface and Conventional Commits support. |
| **CORS allowlist via `CORS_ORIGINS` env var** | Production needs a strict origin allowlist; local dev needs permissive defaults. `CORS_ORIGINS ?? true` gives both with zero config for dev. Comma-separated format is simple and deployment-friendly. |
| **Full removal of legacy MQTT topics (no deprecation window)** | The legacy `DoorCloud/photo/#` topics were already gated behind `MQTT_LEGACY_TOPICS_ENABLED` and no active clients used them. A clean break (with CHANGELOG breaking-change entry) was preferred over a sunset period. |
| **Mosquitto in CI via Docker Compose + healthcheck polling** | The existing `test:mqtt` suite needs a real broker. Docker Compose matches the local dev setup; healthcheck polling avoids flaky `sleep` races. |

## Files Modified / Created / Deleted

### Created
- `biome.json` — Biome configuration (60 lines)
- `.github/workflows/test.yml` `mqtt-integration` job (57 lines added)

### Deleted
- `.eslintrc` (104 lines)
- `DoorCloud/photo/#` entries from `infra/mosquitto/aclfile` (4 lines)
- `MQTT_LEGACY_TOPICS_ENABLED` from `src/config/env.ts` and `.env.example`
- `parseLegacyPhotoSendPayload`, `parseLegacyPhotoMetricsPayload` from `src/network/mqtt/photoPayloads.ts`
- `LEGACY_PHOTO_TOPIC_FILTER`, `isLegacyPhotoTopic`, legacy branch from `src/network/mqtt/topics.ts`
- Legacy imports and branches from `src/network/mqtt/routes/photo.ts`
- Legacy test cases from `test/index.test.ts`
- Stale `eslint-disable` comments from `src/database/supabase/connection.ts`, `src/lib/human/index.ts`, `src/network/mqtt/mqtt.ts`
- `.eslintrc` / `.eslintignore` lines from `.dockerignore`

### Modified
- `package.json` — swapped `standard-version` → `commit-and-tag-version`; removed ESLint/Prettier deps; added `@biomejs/biome`; updated `release`, `lint`, `lint:fix`, `format` scripts
- `pnpm-lock.yaml` — lockfile refresh
- `src/config/env.ts` — added `CORS_ORIGINS` parser; removed `MQTT_LEGACY_TOPICS_ENABLED`
- `src/network/server.ts` — CORS allowlist config; removed `preHandler` hook
- `test/index.test.ts` — added `CORS_ORIGINS` tests; removed legacy topic tests
- `README.md` — documented `CORS_ORIGINS`, Biome, `commit-and-tag-version`; removed legacy topic references
- `CHANGELOG.md` — added breaking-change entry for MQTT legacy removal
- `src/network/mqtt/topics.ts`, `photoPayloads.ts`, `routes/photo.ts` — simplified to versioned-only APIs
- `infra/mosquitto/aclfile` — removed legacy ACL entries
- 17 source files reformatted by Biome (see commit `8c0a7b6`)

## Commits Created

| # | SHA | Message |
|---|-----|---------|
| 1 | `7d16490` | `chore: migrate release tooling from standard-version to commit-and-tag-version` |
| 2 | `118aeee` | `feat: restrict CORS with allowlist and remove x-powered-by header` |
| 3 | `1fb5845` | `feat!: remove legacy DoorCloud/photo/# MQTT topic support` |
| 4 | `6c17787` | `ci: add mqtt-integration job with Mosquitto Docker service` |
| 5 | `8c0a7b6` | `chore: migrate lint tooling from ESLint+Prettier to Biome` |
| 6 | `4461939` | `chore: remove stale eslint-disable comments and update docs after Biome migration` |

## Verification Results

All quality gates passed:

| Gate | Command | Result |
|------|---------|--------|
| Unit tests | `pnpm test:local` | ✅ 23 tests passed (216ms) |
| Type check | `pnpm typecheck` | ✅ clean |
| Lint | `pnpm lint` | ✅ 43 files, no issues |

All 5 specs verified compliant (15/15 tasks checked). See `verify-report.md` for the full spec compliance matrix.

### Warnings Resolved at Archive Time
The verify report flagged 5 warnings, all resolved before archive:
1. ✅ Stale `MQTT_LEGACY_TOPICS_ENABLED` in README — removed in commit `4461939`
2. ✅ Stale `eslint-disable` comments in 3 source files — removed in commit `4461939`
3. ✅ `.dockerignore` referencing deleted `.eslintrc` / `.eslintignore` — cleaned in commit `4461939`
4. ✅ `openspec/config.yaml` stale tooling references — already updated to Biome
5. ✅ `.prettierrc` not created — intentional deviation; Prettier was fully removed, so no config needed

## Specs Synced to Main

| Domain | Action | Location |
|--------|--------|----------|
| `ci-mosquitto-integration` | Created | `openspec/specs/ci-mosquitto-integration/spec.md` |
| `http-security-hardening` | Created | `openspec/specs/http-security-hardening/spec.md` |
| `lint-tooling-upgrade` | Created | `openspec/specs/lint-tooling-upgrade/spec.md` |
| `mqtt-legacy-removal` | Created | `openspec/specs/mqtt-legacy-removal/spec.md` |
| `release-tooling-migration` | Created | `openspec/specs/release-tooling-migration/spec.md` |

## Follow-up Recommendations

1. **Add test coverage reporting** — No coverage tooling is configured. Consider adding `@vitest/coverage-v8` now that the test suite is stable.
2. **E2E test layer** — Currently only unit + MQTT integration. An E2E layer (e.g. against a real WhatsApp provider mock) would catch cross-layer regressions.
3. **Biome rule expansion** — The current `biome.json` mirrors the old ESLint config conservatively. Consider enabling additional Biome rules (e.g. `useUnifiedTypeSignatures`, `noNonNullAssertion`) as a follow-up cleanup.
4. **MQTT ACL hardening** — The Mosquitto ACL file now only covers versioned topics. Consider adding integration tests that assert the ACL file contents to prevent accidental reintroduction of legacy entries.
5. **Release dry-run in CI** — `commit-and-tag-version` is configured but not exercised in CI. A `release --dry-run` step would catch changelog/version drift early.

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. All 5 phases delivered. Ready for the next change.
