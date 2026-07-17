# Design: P3 Operational Cleanup

## Technical Approach

Five independent cleanup tracks, ordered by isolation and risk. Each track is a self-contained commit group that passes all quality gates before the next begins.

## Architecture Decisions

### Decision: Biome replaces ESLint + Prettier

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Biome | Native TS7 support, single config, 10-50x faster, no Babel workaround | **Chosen** |
| ESLint 9 + flat config | Requires @typescript-eslint TS7 support (not available); keeps Babel workaround | Rejected |

**Rationale**: The Babel parser workaround exists solely because `@typescript-eslint` cannot parse TS7. Biome parses TypeScript natively, eliminating 9 devDependencies and the `eslint-plugin-prettier` bridge. The rule set in `.eslintrc` (max-len 80, singleQuote, no semi, trailingComma none, arrowParens avoid, object-shorthand, prefer-const, curly multi) maps directly to Biome rules.

### Decision: CORS defaults to permissive when `CORS_ORIGINS` unset

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Require `CORS_ORIGINS` at startup | Breaks existing deployments silently | Rejected |
| Default to `origin: true` (allow all) when unset | Backward compatible, opt-in restriction | **Chosen** |

**Rationale**: Existing deployments have no `CORS_ORIGINS`. Requiring it would be a breaking change. The spec explicitly allows `*` as default.

### Decision: Remove legacy payload parsers with legacy topics

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Keep legacy parsers as dead code | Confusing, unused exports | Rejected |
| Remove `parseLegacyPhotoSendPayload`, `parseLegacyPhotoMetricsPayload`, `isLegacyPhotoTopic` | Clean break, matches spec intent | **Chosen** |

**Rationale**: The spec says "remove all legacy topic detection and routing logic." Legacy delimiter-based parsers (`----` split) are only useful with legacy topics.

## Data Flow

### MQTT message processing (after cleanup)

```
Mosquitto Broker
    │
    ▼ doorcloud/v1/photo/send
MQTT Client (mqtt.ts)
    │
    ▼ client.on('message')
router.ts → photo.ts sub()
    │
    ├── isPhotoSendTopic(topic) ──→ parsePhotoSendPayload() → JSON only
    │                                    │
    │                                    ▼
    │                              UserServices.sendPhotoThroughWhatsapp()
    │
    └── isPhotoMetricsTopic(topic) ──→ parsePhotoMetricsPayload() → JSON only
                                          │
                                          ▼
                                    recordMetrics() → CSV append
```

No legacy branch. No `isLegacyPhotoTopic` check. No `MQTT_LEGACY_TOPICS_ENABLED` flag.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modify | Remove `standard-version`; add `commit-and-tag-version`; update `release` script; remove ESLint/Prettier deps; add `@biomejs/biome`; update `lint`/`lint:fix`/`format` scripts |
| `src/config/env.ts` | Modify | Remove `MQTT_LEGACY_TOPICS_ENABLED` (L96-99); add `CORS_ORIGINS` as optional comma-separated string |
| `src/network/mqtt/topics.ts` | Modify | Remove `LEGACY_PHOTO_TOPIC_FILTER`, `isLegacyPhotoTopic`, legacy branches in `isPhotoSendTopic`/`isPhotoMetricsTopic`; simplify `getPhotoSubscriptionTopics` (no parameter) |
| `src/network/mqtt/routes/photo.ts` | Modify | Remove `MQTT_LEGACY_TOPICS_ENABLED` usage; remove legacy payload imports; simplify `getPhotoSendPayload`/`getPhotoMetricsPayload` to call versioned parsers directly |
| `src/network/mqtt/photoPayloads.ts` | Modify | Remove `parseLegacyPhotoSendPayload`, `parseLegacyPhotoMetricsPayload` and their exports |
| `src/network/server.ts` | Modify | Replace `cors, {}` with `cors, { origin }` using `CORS_ORIGINS`; remove entire `preHandler` hook (x-powered-by + redundant CORS headers) |
| `infra/mosquitto/aclfile` | Modify | Remove `DoorCloud/photo/#` lines (L4, L6, L10, L13) |
| `.github/workflows/test.yml` | Modify | Add `mqtt-integration` job that runs `pnpm test:mqtt` with Mosquitto via Docker Compose |
| `.eslintrc` | Delete | Replaced by `biome.json` |
| `biome.json` | Create | Biome config preserving current formatting rules |
| `.prettierrc` | Create | Standalone Prettier config (for any non-Biome formatting needs) |
| `.env.example` | Modify | Remove `MQTT_LEGACY_TOPICS_ENABLED`; add `CORS_ORIGINS` |
| `README.md` | Modify | Remove legacy topic references; document `CORS_ORIGINS`; update lint instructions; update release instructions |
| `CHANGELOG.md` | Modify | Add breaking change entry for legacy topic removal |

## Implementation Order

| Phase | Spec | Rationale |
|-------|------|-----------|
| 1 | Release tooling | Zero code risk, 2 file changes, validates CI still passes |
| 2 | HTTP security | Small, isolated to `env.ts` + `server.ts`, no MQTT coupling |
| 3 | MQTT legacy removal | Core change, touches 4 source files + ACLs; benefits from clean CI baseline |
| 4 | CI Mosquitto | Depends on MQTT changes being stable; validates them in CI |
| 5 | Lint tooling | Largest file churn (every `.ts` file may reformat); do last to avoid rebasing other changes |

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `env.ts` CORS parsing, topic detection without legacy | Vitest tests for `parseEnv` with/without `CORS_ORIGINS`; verify `getPhotoSubscriptionTopics` returns only versioned topics |
| Integration | MQTT end-to-end with Mosquitto | Existing `test/mqtt.integration.test.ts` validates broker connectivity; versioned topics already tested |
| CI | Mosquitto job in GitHub Actions | New `mqtt-integration` job runs `pnpm test:mqtt`; parallel with `test` and `lint` jobs |
| Manual | CORS allowlist, release dry-run | `curl -H "Origin: ..."` to verify CORS headers; `pnpm release -- --dry-run` for release tooling |
| Lint | Biome equivalence | `pnpm lint` passes; spot-check formatting matches current output |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary changes.

## Migration / Rollout

**No data migration required.** This is an operational cleanup:

- **MQTT**: Breaking change for publishers still on `DoorCloud/photo/#`. Release notes must include migration path.
- **CORS**: Non-breaking. `CORS_ORIGINS` unset = current behavior (allow all).
- **Lint**: Non-breaking for runtime. May require `pnpm lint:fix` for formatting adjustments.
- **Release**: Drop-in replacement. No config migration needed (no `.versionrc` exists).

## Rollback Procedures

| Track | Rollback |
|-------|----------|
| MQTT legacy | `git revert` the removal commit; restore `MQTT_LEGACY_TOPICS_ENABLED` |
| CORS | Unset `CORS_ORIGINS` env var (defaults to allow all) |
| CI Mosquitto | Remove `mqtt-integration` job from workflow |
| Lint | `git revert` to restore `.eslintrc` and ESLint deps |
| Release | `git revert`; `standard-version` and `commit-and-tag-version` are independent |

## Open Questions

- [ ] Are all publishers confirmed migrated to `doorcloud/v1/photo/*`? (Prerequisite for Phase 3)

## Resolved Questions

- [x] Biome `formatter.lineEnding`: **Not configured** — let Biome auto-detect per file. This allows seamless work across Windows (CRLF) and Mac/Linux (LF) without forcing a specific style.
