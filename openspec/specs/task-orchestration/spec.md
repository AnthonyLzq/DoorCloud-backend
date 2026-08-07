# Spec: Task Orchestration

## Overview

Adds Turborepo to the monorepo to replace hand-wired build ordering. Currently
`@doorcloud/shared` ships a gitignored `dist`, and every consumer of
`@doorcloud/shared` must be preceded by an explicit `pnpm --filter
@doorcloud/shared build` (manually repeated in `test.yml` and
`runtime-integration.yml`). Turbo infers that dependency from the workspace
graph so a task graph drives ordered builds and parallel dev.

## Requirements

### TO-1: Turbo task graph

A root `turbo.json` SHALL define pipeline tasks for
build/lint/typecheck/test/dev. `turbo run build`, `turbo run lint`, `turbo run
typecheck`, and `turbo run test:ci` SHALL execute the per-package scripts
(`build`, `lint`, `typecheck`, `test:ci`) across every workspace package.
(`test:ci` is the task name because no package defines a bare `test` script.)

#### Scenario: Graphs all packages

- GIVEN a checkout of the monorepo with dependencies installed
- WHEN `turbo run build` is invoked
- THEN the task SHALL run the `build` script for every package in the workspace### TO-2: Shared-first ordering

`@doorcloud/backend` and `@doorcloud/web` MUST declare a dependency on
`@doorcloud/shared#build` in the turbo graph, because both consume the built
`dist` of the shared package. Turbo SHALL schedule `@doorcloud/shared`'s build
before its consumers on a clean checkout with no cached `dist`.

#### Scenario: Consumers build after shared

- GIVEN a fresh clone where `packages/shared/dist` does not exist
- WHEN `turbo run build` completes
- THEN the backend and web images show `@doorcloud/shared` built first
- AND the consumers build against the produced `dist`

#### Scenario: Cache respects the dependency

- GIVEN a build already produced cached outputs
- WHEN `turbo run build` runs again without changes
- THEN upstream tasks report cache hits and are not re-executed

### TO-3: Parallel development

`turbo run dev` SHALL start the development watchers for the backend, web, and
shared packages concurrently in a single terminal. The web dev server SHALL
keep proxying API calls to the backend on port `1996` (existing `vite.config.ts`
proxies `/setup`, `/admin`, `/photos`).

#### Scenario: Covers each watcher

- GIVEN a developer runs `turbo run dev`
- WHEN the task starts
- THEN the process is the web asset pipeline, the shared watcher, and the
  backend watcher, all interacting over the same local port contract

#### Scenario: Parallel failures

- GIVEN one package's dev watcher exits non-zero
- WHEN the task group terminates
- THEN the overall `turbo run dev` exits non-zero so the failure is visible

### TO-4: CI uses the turbo graph

`.github/workflows/test.yml` and `.github/workflows/runtime-integration.yml`
SHALL drive the ordered build/lint/typecheck/test through `turbo` instead of
manually invoking `pnpm --filter @doorcloud/shared build` before each consumer.
The deduplicated ordering MUST remain correct against a clean checkout.

#### Scenario: Fresh clone CI

- GIVEN CI checks out the repository and runs `pnpm install --frozen-lockfile`
- WHEN the workflow runs the turbo build/lint/typecheck/test steps
- THEN all workspace tasks pass without a separate manual shared build step
- Scenario: MQTT integration path
- GIVEN the MQTT integration job needs the shared build
- WHEN it runs the required turbo task
- THEN the consumers resolve the built `@doorcloud/shared` dependency

### TO-5: Outputs and cache

`turbo.json` SHALL declare the cached outputs each task produces depending on
its inputs and outputs. The turbo cache must not emit artifacts into the
repository or break a fresh-clone workflow.

#### Scenario: Outputs cause a cache hit

- GIVEN a previous run produced the declared outputs
- WHEN a follow-up run inputs are unchanged across an explicit/no-op run
- THEN the cache reports the task as fully cached and skips re-running it

#### Scenario: No stale output reused

- GIVEN a change to a source file affecting a task's inputs
- WHEN the task runs again
- THEN turbo invalidates the prior cache entry and re-executes it

## Non-Goals

Turbo Cloud remote caching, `islands`/`ui` splitting, and adding a `web`
container (the SPA stays served by the backend).