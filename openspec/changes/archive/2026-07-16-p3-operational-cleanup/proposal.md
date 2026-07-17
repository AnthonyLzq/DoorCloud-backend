# Proposal: P3 Operational Cleanup

## Historical Context (Completed Phases)

This change builds on completed modernization work documented in `.goals/repo-mqtt-package-plan/review-and-migration-plan.md`:

### P0 — Baseline & Type Safety ✅ COMPLETED
- Replaced ambient `src/@types` globals with explicit modules (`UserSupabase`, `MqttRoute`)
- Updated `tsconfig.test.json` to remove legacy type includes
- CI aligned: Node 22.20.0, pnpm 10.30.1, frozen lockfile, deterministic lint/test/typecheck

### P1 — Compiler & Tooling ✅ COMPLETED
- TypeScript upgraded to 7.0.2
- `tsconfig.base.json` updated for TS7: `baseUrl` → `paths`, removed `downlevelIteration`, `moduleResolution` → `node16`, `module` → `Node16`
- `vitest.config.ts` → `vitest.config.mts` for ESM compatibility
- ESLint uses `@babel/eslint-parser` + `@babel/preset-typescript` for TS7 compatibility (since `@typescript-eslint` doesn't support TS7 yet)

### P2 — Application Dependencies ✅ COMPLETED
- **Fastify 5.10.0**: Upgraded with compatible `@fastify/cors` and `@fastify/multipart`
- **Zod 4.4.3**: Migrated to `fastify-type-provider-zod` with `@fastify/swagger`
- **HTTP routes**: Use Zod schemas directly, removed custom AJV validator
- **MQTT.js 5.15.2**: Upgraded, Mosquitto integration tests pass
- **WhatsApp provider**: Twilio replaced with OpenWA (text + image messages)
- **Setup UI**: `/setup` endpoint for OpenWA management, `pnpm openwa:qr` for QR sign-in
- **Preservice script**: Auto-syncs `OPENWA_API_KEY` from Docker Compose

## Intent

Complete P0–P2 modernization: cutover to local Mosquitto, remove legacy MQTT topics, add CI broker tests, tighten HTTP security defaults, and modernize lint/format/release tooling. Closes gaps from the historical migration plan.

## Scope

### In Scope
- External broker fallback/rollback window; legacy `DoorCloud/photo/#` removal
- Versioned topic enforcement (`doorcloud/v1/photo/*`)
- CI job for Mosquitto integration tests
- CORS restriction; `x-powered-by: Simba.js` removal
- ESLint/Prettier major update or Biome migration
- Release tooling: `standard-version` → `commit-and-tag-version`

### Out of Scope
- OpenWA deployment/session operations
- ML/native package updates
- MQTT payload redesign (base64 → object reference)

## Capabilities

### New Capabilities
- `mqtt-broker-ci`: Docker-backed Mosquitto integration test job
- `http-security-hardening`: Restricted CORS origins; removal of Simba.js header

### Modified Capabilities
- `mqtt-topic-versioning`: Remove legacy `DoorCloud/photo/#` compatibility; enforce `doorcloud/v1/photo/*` only

## Approach

1. **Mosquitto cutover**: Define rollback window. Migrate publishers to versioned topics. Remove `MQTT_LEGACY_TOPICS_ENABLED` and legacy code.
2. **CI**: Add GitHub Actions job starting Mosquitto via Compose, running `pnpm test:mqtt`.
3. **HTTP hardening**: Replace open CORS with `CORS_ORIGINS` allowlist. Remove `x-powered-by` preHandler.
4. **Tooling**: Evaluate Biome. Otherwise ESLint 9+ flat config + Prettier 3.x.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/network/mqtt/topics.ts` | Modified | Remove legacy topic constants |
| `src/network/mqtt/routes/photo.ts` | Modified | Drop legacy subscription |
| `src/config/env.ts` | Modified | Remove `MQTT_LEGACY_TOPICS_ENABLED`; add `CORS_ORIGINS` |
| `src/network/server.ts` | Modified | Restrict CORS; remove `x-powered-by` |
| `.github/workflows/` | New/Modified | Add Mosquitto CI job |
| `.eslintrc` / `biome.json` | Modified/Replaced | Lint migration |
| `package.json` | Modified | Update deps; replace `standard-version` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Publishers still use legacy topics | Medium | Keep flag default `true` during rollback |
| CI Docker unavailable | Low | Fallback: local-only `pnpm test:mqtt` |
| CORS allowlist breaks clients | Medium | Default to `*` when `CORS_ORIGINS` unset |
| Biome migration churn | Medium | Run parallel to ESLint for one release |

## Rollback Plan

- **MQTT**: Re-add `MQTT_LEGACY_TOPICS_ENABLED=true`; restore legacy code. Repoint to external broker if needed.
- **CORS**: Revert `CORS_ORIGINS` to unset.
- **Tooling**: `git revert` lint/format commit.
- **CI**: Disable Mosquitto job.

## Dependencies

- Docker in GitHub Actions
- All publishers on `doorcloud/v1/photo/*` before legacy removal
- `@typescript-eslint` TS7 support (optional)

## Success Criteria

- [ ] `MQTT_LEGACY_TOPICS_ENABLED` removed; only versioned topics active
- [ ] CI runs Mosquitto tests on every PR
- [ ] CORS restricted; `x-powered-by: Simba.js` removed
- [ ] Lint tooling upgraded; `pnpm lint` passes
- [ ] Release tooling migrated to `commit-and-tag-version`
- [ ] All gates pass: `lint`, `test:local`, `test:mqtt`, `typecheck`, `build`
