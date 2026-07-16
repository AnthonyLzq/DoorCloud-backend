# Goal: Repository MQTT and package update plan

## User Request

Revisá profundamente este repo. La estructura se basa en una versión antigua de `../simba.js/`; revisalo y luego lo actualizaremos. Después, quiero eliminar completamente la necesidad de usar un servidor externo de MQTT para el procesamiento de datos, quiero usar algo como Mosquitto; revisá `../../SkyTech/SkyTech/` para ver cómo lo hicimos. Planeá todo esto junto a una actualización completa de paquetes.

Interview refinements:
- First stage only: produce a deep review and actionable plan, not product-code implementation.
- Minimum deliverables: report, comparison with `simba.js` and `SkyTech`, phased plan, risks, and quality gates.
- Mosquitto should be treated as the main candidate while documenting alternatives and risks.
- Product code, dependency manifests, lockfiles, and runtime behavior must not be changed in this stage.

## Refined Goal

Create a comprehensive planning deliverable for modernizing DoorCloud-backend. The deliverable must analyze the current repository structure, compare it with the local `simba.js` reference to identify inherited or outdated architecture, study the `SkyTech/SkyTech` implementation for its MQTT/Mosquitto approach, and produce a phased migration plan for removing the need for an external MQTT server in data processing. It must also include a complete package-update strategy with validation and rollback guidance, without modifying product code or dependency manifests.

The primary output should be a Markdown report at `.goals/repo-mqtt-package-plan/review-and-migration-plan.md`.

## Acceptance Criteria

- [ ] Criterion 1: `.goals/repo-mqtt-package-plan/review-and-migration-plan.md` exists and documents the current DoorCloud-backend architecture, key modules, data-processing flow, MQTT usage, package/dependency surface, and quality-gate situation.
- [ ] Criterion 2: The report compares DoorCloud-backend against `/home/anthony/Development/personal-projects/simba.js`, identifying concrete inherited patterns, outdated structural assumptions, and update opportunities relevant to a future modernization.
- [ ] Criterion 3: The report examines `/home/anthony/Development/SkyTech/SkyTech` and documents how MQTT/Mosquitto or equivalent local broker/data-processing infrastructure is handled there, including reusable patterns and differences from DoorCloud-backend.
- [ ] Criterion 4: The report includes a phased migration plan to eliminate reliance on an externally managed MQTT server for data processing, using Mosquitto as the primary candidate and noting alternatives, deployment/configuration changes, security implications, compatibility concerns, risks, rollback steps, and test strategy.
- [ ] Criterion 5: The report includes a complete package-update plan: current package-manager context, dependency groups to update, likely breaking-change areas, recommended upgrade order, commands to inspect/apply updates later, and validation gates after each phase.
- [ ] Criterion 6: No product source files, dependency manifests, lockfiles, environment templates, or deployment/runtime files are modified in this stage; only `.goals/repo-mqtt-package-plan/` planning/process artifacts may be added or updated.

## Scope Boundaries

**In scope:**
- Deep read-only review of `/home/anthony/Development/personal-projects/DoorCloud-backend`.
- Read-only comparison with `/home/anthony/Development/personal-projects/simba.js`.
- Read-only comparison with `/home/anthony/Development/SkyTech/SkyTech`.
- Creation of `.goals/repo-mqtt-package-plan/review-and-migration-plan.md`.
- Planning for future code modernization, Mosquitto/local-MQTT migration, package updates, quality gates, risk management, and rollback.
- Builder and Inspector process commits required by the Goal skill.

**Out of scope:**
- Implementing MQTT/Mosquitto changes.
- Updating packages, dependency manifests, or lockfiles.
- Refactoring product code.
- Changing environment files, deployment files, CI files, or runtime configuration.
- Starting long-lived services.
- Making changes outside `.goals/repo-mqtt-package-plan/`, except commits of the Goal skill process artifacts in that directory.

## Applicable Project Conventions

**Quality gate command:**
- `pnpm lint` (`eslint src/* --ext .ts --no-error-on-unmatched-pattern`)
- `pnpm test:local` (`jest --setupFiles dotenv/config --ci -i`)
- No `preflight`, `check`, `sct`, `build`, or `typecheck` script was discovered.
- For this planning-only goal, Inspector must at minimum verify the git diff only changes `.goals/repo-mqtt-package-plan/` and verify the report satisfies every acceptance criterion. If product files are unexpectedly changed, run the relevant gates and fail the iteration.

**Commit convention:**
- No explicit project commit rules were found.
- Use Conventional Commits, inferred from `standard-version` setup and git history (`feat:`, `fix:`, `chore(release):`).
- Builder commits must use `type(scope): [B] description`.
- Inspector commits must use `chore(scope): [I] description`.
- Assisted-by trailer required: `Assisted-by: OpenAI:GPT-5.5`

**Guidelines:**
- No `AGENTS.md`, `CONSTITUTION.md`, `.agents/guidelines/`, or `.github/guidelines/` were found in the repository or checked parents.

**Rules:**
- Package manager is `pnpm` (`package.json` declares `pnpm >=7`).
- Existing scripts relevant to validation are `lint`, `test:local`, and `test:ci`.
