# Spec: Release Tooling Migration

## Overview

Migrate from `standard-version` (deprecated/unmaintained) to `commit-and-tag-version` (actively maintained fork). This is a drop-in replacement that provides the same functionality with ongoing support and security updates.

## Requirements

### REQ-1: Remove standard-version

The system SHALL remove the deprecated `standard-version` package.

**Scenarios:**

- **Given** the current `package.json` has `standard-version` in `devDependencies`
- **When** the migration is performed
- **Then** `standard-version` SHALL be removed from `devDependencies`
- **And** `node_modules` SHALL be updated to remove the package
- **And** `pnpm-lock.yaml` SHALL be updated accordingly

### REQ-2: Install commit-and-tag-version

The system SHALL install `commit-and-tag-version` as a replacement.

**Scenarios:**

- **Given** `standard-version` has been removed
- **When** the migration is performed
- **Then** `commit-and-tag-version` SHALL be added to `devDependencies`
- **And** the latest stable version SHALL be installed
- **And** the package SHALL be compatible with Node.js 22.20.0

### REQ-3: Update Release Script

The system SHALL update the `release` script to use `commit-and-tag-version`.

**Scenarios:**

- **Given** the current `release` script uses `standard-version`
- **When** the migration is performed
- **Then** the `release` script SHALL be updated to `commit-and-tag-version`
- **And** the script SHALL maintain the same behavior (bump version, generate changelog, create tag)
- **And** `pnpm release` SHALL work without errors

### REQ-4: Maintain Configuration Compatibility

The system SHALL maintain any existing release configuration.

**Scenarios:**

- **Given** the project uses Conventional Commits
- **When** the migration is performed
- **Then** the changelog generation SHALL continue to work
- **And** version bumping SHALL follow the same rules (major/minor/patch based on commits)
- **And** git tags SHALL be created in the same format (e.g., `v1.0.0`)
- **And** any existing `.versionrc` or configuration SHALL be compatible or migrated

### REQ-5: Documentation Update

The system documentation SHALL reflect the new release tool.

**Scenarios:**

- **Given** the migration is complete
- **When** the README is updated
- **Then** the README SHALL document the release process using `commit-and-tag-version`
- **And** the README SHALL mention the command: `pnpm release`
- **And** the README SHALL explain the Conventional Commits requirement
- **And** any release-related documentation SHALL be updated

## Affected Files

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modify | Remove `standard-version`, add `commit-and-tag-version`, update `release` script |
| `pnpm-lock.yaml` | Update | Reflect dependency changes |
| `README.md` | Modify | Update release documentation |

## Non-Goals

- Changing the release workflow or process (rejected, keep it simple)
- Adding new release features (rejected, drop-in replacement only)
- Migrating to a completely different release tool like semantic-release (rejected, too much change)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Configuration incompatibility | Low | Low | `commit-and-tag-version` is a drop-in fork, should be compatible |
| Changelog format changes | Low | Low | Review generated changelog, adjust config if needed |
| Git tag format changes | Low | Low | Verify tag format matches existing tags |

## Success Criteria

- [ ] `standard-version` removed from `package.json`
- [ ] `commit-and-tag-version` added to `package.json`
- [ ] `release` script updated to use `commit-and-tag-version`
- [ ] `pnpm install` succeeds
- [ ] `pnpm release` works (test with `--dry-run` first)
- [ ] Changelog generation works correctly
- [ ] Git tags are created in the expected format
- [ ] README updated with release instructions

## Dependencies

- No external dependencies
- Existing Conventional Commits history should be preserved
