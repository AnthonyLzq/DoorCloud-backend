# Spec: Lint Tooling Upgrade

## Overview

Modernize the linting and formatting toolchain by evaluating Biome as an alternative to ESLint + Prettier, or upgrading to ESLint 9+ with flat config and Prettier 3.x. Restore TypeScript-aware linting when @typescript-eslint supports TypeScript 7.

## Requirements

### REQ-1: Evaluate Biome vs ESLint 9+

The system SHALL evaluate Biome as a potential replacement for ESLint + Prettier.

**Scenarios:**

- **Given** the current lint toolchain (ESLint 8 + Prettier 2)
- **When** evaluating Biome
- **Then** the evaluation SHALL consider:
  - Performance improvement (Biome is significantly faster)
  - Configuration simplicity (single `biome.json` vs multiple configs)
  - TypeScript 7 support (Biome has native TS support)
  - Rule coverage (ensure all current rules can be replicated)
  - Migration effort (config translation, CI changes)
  - Ecosystem maturity (Biome is newer but actively maintained)

- **Given** the evaluation is complete
- **When** deciding between Biome and ESLint 9+
- **Then** the decision SHALL be documented with pros/cons
- **And** the chosen path SHALL be implemented

### REQ-2: Biome Migration (if chosen)

If Biome is chosen, the system SHALL migrate from ESLint + Prettier to Biome.

**Scenarios:**

- **Given** Biome is chosen as the lint/formatter tool
- **When** the migration is performed
- **Then** `biome.json` SHALL be created with equivalent configuration
- **And** the following SHALL be preserved from current config:
  - `max-len`: 80 characters
  - `singleQuote`: true
  - `semi`: false
  - `tabWidth`: 2
  - `trailingComma`: "none"
  - `arrowParens`: "avoid"
  - `bracketSpacing`: true
  - `object-shorthand`: "always"
  - `prefer-const`: "error"
  - `curly`: "multi"
- **And** `.eslintrc` SHALL be removed
- **And** ESLint-related dependencies SHALL be removed from `package.json`:
  - `eslint`
  - `@babel/eslint-parser`
  - `@babel/preset-typescript`
  - `eslint-config-standard`
  - `eslint-config-prettier`
  - `eslint-plugin-import`
  - `eslint-plugin-n`
  - `eslint-plugin-prettier`
  - `eslint-plugin-promise`
- **And** Biome dependencies SHALL be added:
  - `@biomejs/biome`
- **And** `package.json` scripts SHALL be updated:
  - `lint`: `biome check src/`
  - `lint:fix`: `biome check --write src/`
  - `format`: `biome format --write src/`
- **And** CI workflows SHALL be updated to use Biome
- **And** `pnpm lint` SHALL pass with the new configuration

### REQ-3: ESLint 9+ Migration (if chosen)

If ESLint 9+ is chosen, the system SHALL migrate to flat config and Prettier 3.x.

**Scenarios:**

- **Given** ESLint 9+ is chosen as the lint tool
- **When** the migration is performed
- **Then** `eslint.config.js` (flat config) SHALL be created
- **And** `.eslintrc` SHALL be removed
- **And** the following dependencies SHALL be upgraded:
  - `eslint`: `^9.0.0` or later
  - `prettier`: `^3.0.0` or later
  - `eslint-config-prettier`: latest compatible version
  - `eslint-plugin-import`: latest compatible version
  - `eslint-plugin-n`: latest compatible version
  - `eslint-plugin-promise`: latest compatible version
- **And** `@babel/eslint-parser` and `@babel/preset-typescript` SHALL be removed (if @typescript-eslint supports TS7)
- **And** `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` SHALL be added (if TS7 is supported)
- **And** the flat config SHALL preserve current rules:
  - `max-len`: 80 characters
  - `singleQuote`: true
  - `semi`: false
  - `tabWidth`: 2
  - `trailingComma`: "none"
  - `arrowParens`: "avoid"
  - `bracketSpacing`: true
  - `object-shorthand`: "always"
  - `prefer-const`: "error"
  - `curly`: "multi"
- **And** `package.json` scripts SHALL remain compatible:
  - `lint`: `eslint src/ --ext .ts`
- **And** CI workflows SHALL be updated if needed
- **And** `pnpm lint` SHALL pass with the new configuration

### REQ-4: TypeScript-Aware Linting

The system SHALL restore TypeScript-aware linting when possible.

**Scenarios:**

- **Given** @typescript-eslint supports TypeScript 7
- **When** the lint toolchain is configured
- **Then** TypeScript-aware rules SHALL be enabled:
  - `@typescript-eslint/no-unused-vars`
  - `@typescript-eslint/no-explicit-any`
  - `@typescript-eslint/explicit-function-return-type` (optional)
  - Other recommended TS rules
- **And** the Babel parser workaround SHALL be removed
- **And** type-aware linting SHALL be configured if beneficial

- **Given** @typescript-eslint does NOT support TypeScript 7
- **When** the lint toolchain is configured
- **Then** the Babel parser workaround SHALL remain (if using ESLint)
- **And** a comment SHALL document the limitation
- **And** a follow-up task SHALL be created to revisit when TS7 is supported

### REQ-5: Prettier Configuration Separation

The system SHALL separate Prettier configuration from ESLint configuration.

**Scenarios:**

- **Given** the current setup has Prettier config in `.eslintrc`
- **When** the migration is performed
- **Then** `.prettierrc` (or `prettier.config.js`) SHALL be created
- **And** the following Prettier options SHALL be preserved:
  - `arrowParens`: "avoid"
  - `bracketSpacing`: true
  - `printWidth`: 80
  - `quoteProps`: "as-needed"
  - `semi`: false
  - `singleQuote`: true
  - `tabWidth`: 2
  - `trailingComma`: "none"
- **And** `.eslintrc` (or `eslint.config.js`) SHALL NOT contain Prettier rules
- **And** `eslint-plugin-prettier` SHALL be removed (if using ESLint)
- **And** `prettier/prettier` rule SHALL be removed from ESLint config

### REQ-6: Documentation Update

The system documentation SHALL reflect the new lint toolchain.

**Scenarios:**

- **Given** the lint toolchain migration is complete
- **When** the README is updated
- **Then** the README SHALL document:
  - Which tool is used (Biome or ESLint)
  - How to run linting: `pnpm lint`
  - How to auto-fix: `pnpm lint:fix` (if applicable)
  - How to format: `pnpm format` (if applicable)
  - Key configuration decisions (why Biome or why ESLint 9+)
- **And** the README SHALL mention any TypeScript-aware linting limitations

## Affected Files

| File | Action | Description |
|------|--------|-------------|
| `.eslintrc` | Delete (if Biome) or Modify (if ESLint 9+) | Remove or migrate to flat config |
| `biome.json` | Create (if Biome chosen) | Biome configuration |
| `eslint.config.js` | Create (if ESLint 9+ chosen) | ESLint flat config |
| `.prettierrc` | Create | Separate Prettier configuration |
| `package.json` | Modify | Update dependencies and scripts |
| `README.md` | Modify | Document new lint toolchain |
| `.github/workflows/lint.yml` | Modify | Update CI if needed |

## Non-Goals

- Adding new lint rules beyond current configuration (rejected, keep behavior equivalent)
- Migrating to a different formatter like dprint (rejected, Prettier is sufficient)
- Implementing lint-staged or husky (out of scope, can be done separately)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Biome lacks a critical rule | Low | Medium | Test all current rules in Biome before committing |
| ESLint 9+ flat config breaks plugins | Medium | Medium | Test all plugins for flat config compatibility |
| @typescript-eslint still doesn't support TS7 | Medium | Low | Keep Babel parser workaround, document limitation |
| Prettier 3 changes formatting | Low | Low | Review formatting changes, accept if reasonable |
| CI breaks due to tool changes | Low | Medium | Test CI locally before pushing |

## Success Criteria

- [ ] Decision documented: Biome or ESLint 9+ (with rationale)
- [ ] Old config files removed (`.eslintrc` if Biome, or legacy format if ESLint 9+)
- [ ] New config files created and working
- [ ] Prettier config separated into `.prettierrc`
- [ ] Dependencies updated in `package.json`
- [ ] Scripts updated and working
- [ ] `pnpm lint` passes
- [ ] CI passes with new toolchain
- [ ] README updated with new lint instructions
- [ ] TypeScript-aware linting enabled (if @typescript-eslint supports TS7)

## Dependencies

- Decision on Biome vs ESLint 9+ (requires evaluation)
- @typescript-eslint TypeScript 7 support status (for TypeScript-aware linting)
