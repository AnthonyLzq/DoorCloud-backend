# Dependency Advisory Register

This file is the repository advisory register (REQ-8). It documents the current
audit posture, what was fixed, what remains, and why anything unavoidable is
kept. Run `pnpm audit` from the repo root to reproduce the numbers below.

## Current Posture

| Date | Severity | Count |
|------|----------|-------|
| Before Slice 1 (2026-08) | critical | 3 |
| Before Slice 1 (2026-08) | high | 31 |
| Before Slice 1 (2026-08) | moderate | 14 |
| **After Slice 1 (2026-08)** | **any** | **0** |

`pnpm audit` reports: `No known vulnerabilities found`.

## Fixed in Slice 1 (runtime dependency upgrades)

| Package | From | To | Advisory | Why |
|---------|------|----|----------|-----|
| `sharp` | ^0.33.x | ^0.35.3 | libvips CVE-2026-33327 / 33328 / 35590 | 0.33.x ships vulnerable libvips; 0.35 is the patched major |
| `@fastify/static` | ^8.3.0 | ^10.1.3 | route-guard bypass via path traversal, path traversal in directory listing, authz bypass via non-canonical paths | v8/v9 vulnerable; 10.1.3 is patched |
| `fastify` | ^5.10.0 | ^5.11.3 | HTTP/2 DDoS (find-my-way), host confusion (fast-uri) | patched major set; see overrides below |
| `happy-dom` | ^18.0.1 | ^20.11.2 | critical VM Context Escape RCE, fetch-credentials cookie leak, ECMAScriptModuleCompiler export injection | dev tooling only, but critical severity justified the major bump |

## Fixed via pnpm overrides (root `package.json` -> `pnpm.overrides`)

These packages are transitive dependencies whose parent ranges would otherwise
pin them to vulnerable versions. Overrides force the patched version only where
the parent's declared range allows the major line to stay compatible.

| Override | Forces | Advisory | Parent chain |
|----------|--------|----------|--------------|
| `find-my-way@^9.6.0` | 9.7.0 | DDoS with HTTP/2 | fastify |
| `fast-uri@^3.0.0` | 3.1.5 | host confusion (backslash authority) | fastify > @fastify/ajv-compiler |
| `fast-uri@^4.0.0` | 4.1.2 | host confusion (backslash authority) | fastify > fast-json-stringify |
| `ip-address@^10.4.0` | 10.4.0 | CIDR suppression of special-use classification; IPv4-mapped/NAT64 misclassification; leading-zero octet decoding | mqtt > socks |
| `adm-zip@^0.6.0` | 0.6.0 | crafted ZIP 4GB memory allocation | onnxruntime-node |
| `semver@~7.0.0` | 7.8.5 | ReDoS | nodemon > simple-update-notifier |
| `brace-expansion@^1.1.7` | 1.1.18 | DoS unbounded expansion / intermediate arrays | commit-and-tag-version > dotgitignore > minimatch |
| `brace-expansion@^2.0.1` | 2.1.4 | DoS unbounded expansion / intermediate arrays | pino-pretty > help-me > glob > minimatch |
| `nanoid@^3.3.16` | 3.3.18 | custom generators infinite loop when size is zero | vite > postcss |

## Removed (dead code -> entire advisory chain gone)

- `@tensorflow/tfjs-node` removed from `apps/backend` (runtime): zero imports in
  `apps/backend/src` (rg-verified, tests/benchmarks excluded). Removing it also
  removed the 12 `tar`/`node-pre-gyp` advisories (1 critical, 8 high, 3
  moderate) that existed only under its dependency tree.
- `@vladmandic/human` removed from `apps/backend` (runtime): the only import was
  the dead `apps/backend/src/lib/human/index.ts`, which itself was imported by
  nothing. Deleted `src/lib/human/` and the `src/lib/index.ts` re-export.
- `allowBuilds` entry for `@tensorflow/tfjs-node` removed from
  `pnpm-workspace.yaml`; `onlyBuiltDependencies` entry removed from root
  `package.json`.

## Remaining (accepted, low or zero reachability)

| Item | Reason it stays |
|------|-----------------|
| `@vladmandic/human` in the **root** manifest | Consumed only by root benchmark scripts (`scripts/benchmark-human.ts`, `scripts/embed-one-model.ts`, `scripts/_run-repeat-human.ts`). Not imported by any runtime code in `apps/backend`. The runtime does not ship this path. |
| 12 deprecated subdependencies (conventional-changelog chain, glob 8) | `WARN` only (not advisories). Dev tooling used by `commit-and-tag-version` release flow; upgrade would require a major change to the release toolchain. |

## Rollback

The pre-Slice-1 lockfile state is tagged `security-hardening-slice1-baseline`.
To restore: `git checkout security-hardening-slice1-baseline -- pnpm-lock.yaml
package.json apps/backend/package.json apps/web/package.json
pnpm-workspace.yaml && pnpm install --frozen-lockfile`.

Generated from `pnpm audit` at commit `920ce9a` (baseline) and after Slice 1
implementation.