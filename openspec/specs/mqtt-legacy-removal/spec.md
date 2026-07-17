# Spec: MQTT Legacy Topics Removal

## Overview

Remove support for deprecated `DoorCloud/photo/#` topics and enforce versioned `doorcloud/v1/photo/*` topics exclusively. This eliminates the transition compatibility layer introduced in P2.

## Requirements

### REQ-1: Remove Legacy Topic Configuration

The system SHALL remove all legacy topic configuration and environment variables.

**Scenarios:**

- **Given** the environment configuration schema
- **When** the application starts
- **Then** `MQTT_LEGACY_TOPICS_ENABLED` environment variable SHALL NOT be parsed or validated
- **And** the application SHALL NOT accept this variable

- **Given** the MQTT topics configuration
- **When** topics are defined
- **Then** `DoorCloud/photo/#` SHALL NOT be defined as a topic constant
- **And** only versioned topics (`doorcloud/v1/photo/send`, `doorcloud/v1/photo/metrics`, `doorcloud/v1/photo/result/#`) SHALL be available

### REQ-2: Remove Legacy Topic Subscriptions

The MQTT client SHALL subscribe only to versioned topics.

**Scenarios:**

- **Given** the MQTT client initializes
- **When** subscription topics are determined
- **Then** the client SHALL subscribe to `doorcloud/v1/photo/send`
- **And** the client SHALL subscribe to `doorcloud/v1/photo/metrics`
- **And** the client SHALL NOT subscribe to `DoorCloud/photo/#`

- **Given** a message arrives on `DoorCloud/photo/send`
- **When** the MQTT client receives the message
- **Then** the message SHALL NOT be processed
- **And** the message SHALL be ignored (no error, no logging required)

### REQ-3: Remove Legacy Topic Detection Logic

The system SHALL remove all legacy topic detection and routing logic.

**Scenarios:**

- **Given** a message arrives on `doorcloud/v1/photo/send`
- **When** the topic is validated
- **Then** the system SHALL recognize it as a photo send topic
- **And** the system SHALL NOT check for legacy topic patterns

- **Given** a message arrives on `doorcloud/v1/photo/metrics`
- **When** the topic is validated
- **Then** the system SHALL recognize it as a photo metrics topic
- **And** the system SHALL NOT check for legacy topic patterns

### REQ-4: Update Documentation

The system documentation SHALL reflect the removal of legacy topic support.

**Scenarios:**

- **Given** the README.md file
- **When** MQTT topics are documented
- **Then** only versioned topics SHALL be documented
- **And** the `MQTT_LEGACY_TOPICS_ENABLED` variable SHALL NOT be mentioned
- **And** a migration note SHALL indicate that publishers MUST use `doorcloud/v1/photo/*` topics

### REQ-5: Maintain Backward Compatibility Window

Before removing legacy support, the system SHALL provide a migration window.

**Scenarios:**

- **Given** the current release has `MQTT_LEGACY_TOPICS_ENABLED=true` as default
- **When** this change is deployed
- **Then** the release notes SHALL include a breaking change notice
- **And** the release notes SHALL specify that all publishers MUST migrate to versioned topics before upgrading
- **And** the release notes SHALL provide the migration path (topic name changes)

## Affected Files

| File | Action | Description |
|------|--------|-------------|
| `src/config/env.ts` | Modify | Remove `MQTT_LEGACY_TOPICS_ENABLED` validation |
| `src/network/mqtt/topics.ts` | Modify | Remove legacy topic constants and detection functions |
| `src/network/mqtt/routes/photo.ts` | Modify | Remove legacy topic subscription and routing |
| `README.md` | Modify | Update MQTT topics documentation |
| `CHANGELOG.md` | Modify | Add breaking change entry |

## Non-Goals

- Migrating existing publishers (out of scope, manual process)
- Providing a bridge or proxy for legacy topics (rejected, adds complexity)
- Supporting both legacy and versioned topics simultaneously (rejected, this is the removal phase)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Publishers still use legacy topics | Medium | High | Document migration path, provide rollback instructions |
| Devices cannot be updated immediately | Medium | High | Keep previous release available, document rollback procedure |
| Integration tests break | Low | Medium | Update test fixtures to use versioned topics |

## Rollback Procedure

If legacy topic support is needed after deployment:

1. Revert the commit that removes legacy support
2. Redeploy the previous version
3. Update publishers to use versioned topics
4. Retry the removal after all publishers are migrated

## Success Criteria

- [ ] `MQTT_LEGACY_TOPICS_ENABLED` removed from `src/config/env.ts`
- [ ] Legacy topic constants removed from `src/network/mqtt/topics.ts`
- [ ] Legacy topic detection functions removed
- [ ] MQTT client subscribes only to versioned topics
- [ ] README.md updated with versioned topics only
- [ ] CHANGELOG.md includes breaking change entry
- [ ] All tests pass with versioned topics
- [ ] No references to `DoorCloud/photo/#` in production code

## Dependencies

- All publishers MUST be migrated to `doorcloud/v1/photo/*` topics before this change is deployed
- Integration tests MUST be updated to use versioned topics
