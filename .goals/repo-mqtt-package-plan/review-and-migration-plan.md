# DoorCloud-backend review and migration plan

Date: 2026-07-15
Original scope: planning only; no product source, dependency manifest, lockfile,
env, deployment, or runtime behavior changes.

Status refreshed: 2026-07-16. This refresh reflects implementation already
present in the repository after the original planning pass. P0 and P1 are
complete. P2 is complete through Fastify 5/Zod 4, MQTT.js 5, and replacing
Twilio with an OpenWA WhatsApp provider that can send images.

## 1. Executive summary

DoorCloud-backend is a small TypeScript/Fastify service that combines:

- an HTTP API for creating users and uploading reference photos;
- a long-lived MQTT client that subscribes to photo-processing topics;
- Supabase for user records and photo storage;
- OpenWA WhatsApp messaging;
- `@vladmandic/human` / TensorFlow face comparison; and
- CSV/PNG metric artifacts.

The code still carries clear `simba.js` generator assumptions: a singleton
`Server`, layered folders (`network`, `schemas`, `services`, `database`),
absolute imports from `src`, a `{ error, message }` response envelope, default
port `1996`, open CORS, and the `x-powered-by: Simba.js` header.

The original MQTT gap has been substantially reduced. The repository now has a
local Mosquitto Compose service, broker config/ACL files, password-file
generation outside git, local MQTT environment documentation, versioned
`doorcloud/v1/photo/*` topics, JSON payload parsing/validation, MQTT.js 5, and
Mosquitto-backed integration tests. The remaining MQTT work is no longer
"introduce Mosquitto"; it is production cutover/decommission work: update CI and
deployment paths, decide how long to keep the external broker fallback, migrate
all publishers off legacy `DoorCloud/photo/#` topics, and remove legacy
compatibility after a safe window.

The requested SkyTech reference at `/home/anthony/Development/SkyTech/SkyTech`
does **not** contain MQTT, Mosquitto, Docker, Compose, broker, publish, or
subscribe implementation. It appears to be an Astro/React static site. That
means the DoorCloud Mosquitto design should be treated as new infrastructure,
not a direct port from SkyTech.

Package modernization is now past the baseline/tooling phase and the first
application-major phase. The project pins pnpm `10.30.1`, Node `22.20.0`,
lockfile version `9.0`, TypeScript `7.0.2`, Fastify `5.10.0`, Zod `4.4.3`,
MQTT.js `5.15.2`, OpenWA HTTP messaging, and Vitest `4.1.10`; `pnpm lint`,
`pnpm test:local`, `pnpm test:mqtt`, `pnpm build`, and `pnpm typecheck` pass
locally. Twilio has been removed because image delivery to a controlled
WhatsApp number is now handled through OpenWA.

## 2. Review inputs and limits

Reviewed read-only:

- DoorCloud-backend:
  `/home/anthony/Development/personal-projects/DoorCloud-backend`
- Simba reference:
  `/home/anthony/Development/personal-projects/simba.js`
- SkyTech reference:
  `/home/anthony/Development/SkyTech/SkyTech`

Created/updated only:

- `.goals/repo-mqtt-package-plan/review-and-migration-plan.md`

No secrets from `.env` were read or copied. Only `.env.example` was inspected.

## 3. Current DoorCloud-backend architecture

### 3.1 Repository and runtime shape

Key files:

- `package.json`: package metadata, scripts, dependency surface, Node/pnpm
  engines.
- `src/index.ts`: imports `Server` and calls `Server.start()`.
- `src/network/server.ts`: service composition root.
- `src/network/http/**`: Fastify HTTP routes, response envelope, error
  handling, validation.
- `src/network/mqtt/**`: MQTT client singleton, subscription router, MQTT photo
  route.
- `src/services/user.ts`: business logic for users, photo upload, WhatsApp
  notification, face comparison, metrics.
- `src/database/supabase/**`: Supabase client singleton and user/storage
  queries.
- `src/integrations/whatsapp/**`: OpenWA HTTP client and WhatsApp helpers.
- `src/lib/human/index.ts`: Human/TensorFlow initialization and face matching.
- `metrics/**` and `scripts/histogramForMetrics.py`: metrics collection and
  plotting artifacts.

The service boots as:

1. `src/index.ts` calls `Server.start()`.
2. `Server.start()` creates or reuses the Supabase client.
3. `Server.start()` starts the MQTT route registration through
   `mqttConnection(...).start()`.
4. Fastify listens on `PORT` or `1996`.
5. Human/TensorFlow models are initialized after the HTTP server starts.

### 3.2 HTTP API

`src/network/server.ts` configures Fastify with:

- `@fastify/cors` with open/default settings;
- `@fastify/multipart` with `fields: 3` and `files: 3`;
- Zod route schemas through `fastify-type-provider-zod`;
- a custom pre-handler setting:
  - `Access-Control-Allow-Methods: GET, POST, PATCH, DELETE`;
  - `Access-Control-Allow-Origin: *`;
  - `Access-Control-Allow-Headers: Authorization, Content-Type`;
  - `x-powered-by: Simba.js`;
- validator and serializer compilers from `fastify-type-provider-zod`;
- HTTP routes from `src/network/http/router.ts`.

Implemented HTTP routes:

- `GET /`: returns `DoorCloud backend!`.
- `POST /api/user`: validates `{ name, phone }` and creates a Supabase user.
- `POST /api/user/:folderID/upload`: receives multipart files and uploads them
  to Supabase Storage under a folder derived from `folderID`.

Responses use a common envelope:

```json
{ "error": false, "message": "..." }
```

### 3.3 Data-processing flow

Reference-photo upload flow:

1. Client creates a user with `POST /api/user`.
2. Client uploads reference photos with `POST /api/user/:folderID/upload`.
3. `UserServices.uploadPhotos()` parses `folderID` as `name-id`.
4. Supabase verifies the user ID.
5. Each uploaded image is stored in Supabase Storage bucket `photos`.
6. Signed URLs are returned for uploaded files.

MQTT photo-processing flow:

1. DoorCloud subscribes to `DoorCloud/photo/#`.
2. If a received topic contains `send`, the code expects the message format:
   `userID----format----data:image/<format>;base64,<photo>`.
3. The message is decoded to a Buffer.
4. `UserServices.sendPhotoThroughWhatsapp()`:
   - loads the Supabase user;
   - sends a WhatsApp greeting if `lastMessage` is missing or older than the
     local `MAX_HOUR_DIFFERENCE` threshold;
   - lists the user's reference photos in Supabase Storage;
   - generates signed URLs;
   - compares the incoming photo against each reference image through Human;
   - writes match latency/boolean data to `metrics/matchPhoto.csv`.
5. The code currently comments out the final
   `sendPhotoDetectionResultThroughWhatsapp()` call, so the face-detection
   result is not actively sent in the inspected version.

Metrics flow:

1. If a received MQTT topic contains `metrics`, the payload is expected to
   include a sent timestamp.
2. The service calculates receive latency and appends it to
   `metrics/receivePhoto.csv`.
3. `scripts/histogramForMetrics.py` can generate plots from metric CSVs.

Manual publisher:

- `src/pub.ts` publishes `basic_pub_sub_test.png` to `DoorCloud/image`.
- That topic does not match the active subscription `DoorCloud/photo/#`, so the
  manual publisher and active MQTT photo route appear out of sync.

### 3.4 MQTT usage and gaps

Current MQTT client configuration is in `src/network/mqtt/mqtt.ts`:

- `mqtt.connect(options)` is called once and stored in global
  `__mqttClient__`.
- `protocol`, `host`, `port`, `username`, `password`, `clientId`, `clean`,
  `keepalive`, `reconnectPeriod`, and `connectTimeout` come from validated
  environment variables.
- `MQTT_PROTOCOL` supports both `mqtt` and `mqtts`; this enables local
  Mosquitto development while preserving external TLS broker compatibility.
- Lifecycle logging covers connect, reconnect, offline, close, and error
  events.
- Route registration is dynamic and guarded by `WeakSet` idempotence in
  `src/network/mqtt/router.ts`.
- Subscriptions use configurable QoS through `MQTT_QOS`.

Current MQTT topic constants:

- Preferred send topic: `doorcloud/v1/photo/send`.
- Preferred metrics topic: `doorcloud/v1/photo/metrics`.
- Preferred result topic prefix: `doorcloud/v1/photo/result/#`.
- Deprecated legacy compatibility topic: `DoorCloud/photo/#`, gated by
  `MQTT_LEGACY_TOPICS_ENABLED`.

Implemented Mosquitto/local MQTT pieces:

- `compose.yaml` defines an authenticated local Mosquitto broker.
- `infra/mosquitto/mosquitto.conf` and `infra/mosquitto/aclfile` are committed
  broker config inputs.
- `scripts/mosquitto/create-password-file.sh` generates the password file
  outside git.
- `scripts/mosquitto/run-integration-tests.sh` starts Mosquitto and runs
  integration tests.
- JSON MQTT payloads are parsed/validated with Zod in
  `src/network/mqtt/photoPayloads.ts`.

Remaining MQTT/Mosquitto gaps:

- production broker deployment, monitoring, credential rotation, backup/restore,
  and rollback procedure;
- CI integration job for Mosquitto when Docker is available;
- external broker fallback/removal decision and rollout window;
- legacy `DoorCloud/photo/#` compatibility still remains;
- no TLS CA/cert/key configuration for a production-owned TLS broker;
- no Last Will and Testament;
- image payloads are large base64 blobs over MQTT;
- MQTT.js 5 upgrade is still pending.

### 3.5 Data stores and external services

Supabase:

- `src/database/supabase/connection.ts` creates a global Supabase client from
  `SUPABASE_URL` and `SUPABASE_KEY`.
- Queries operate on a `users` table and `photos` storage bucket.
- Signed URLs are generated with a 900-second lifetime.

WhatsApp/OpenWA:

- `src/integrations/whatsapp/openwa.ts` sends HTTP requests to an OpenWA
  gateway.
- Text messages use `POST /api/sessions/:sessionId/messages/send-text`.
- Image messages use `POST /api/sessions/:sessionId/messages/send-image` with a
  Supabase signed image URL and caption.
- `.env.example` lists `OPENWA_BASE_URL`, `OPENWA_API_KEY`,
  `OPENWA_SESSION_ID`, and `OPENWA_CHAT_ID`.

Human/TensorFlow:

- `src/lib/human/index.ts` creates a global `Human` instance.
- `MODELS_CDN_URL` controls model download location.
- `.env.example` lists `MODELS_CDN_URL`.

### 3.6 Package/dependency surface

Runtime dependencies in `package.json`:

- Fastify stack: `fastify`, `@fastify/cors`, `@fastify/multipart`,
  `@fastify/swagger`, `fastify-type-provider-zod`, `http-errors`,
  `pino-pretty`.
- MQTT: `mqtt`.
- Supabase: `@supabase/supabase-js`, `@supabase/postgrest-js`.
- Messaging: OpenWA over Node `fetch`.
- ML/image: `@tensorflow/tfjs-node`, `@vladmandic/human`.
- Utilities: `debug`, `zod`.

Development dependencies:

- TypeScript runtime/build: `typescript`, `tsx`.
- Test: `vitest`.
- Lint/format: `eslint`, TypeScript ESLint 5, Prettier 2, Standard-related
  plugins.
- Release: `standard-version`.

Other dependency context:

- `requirements.txt` contains Python plotting/data packages for metrics.
- `pnpm-lock.yaml` is lockfile version `9.0`, consistent with the current pnpm
  10 baseline.
- Runtime/tooling baseline:
  - `.nvmrc`: Node `22.20.0`;
  - `packageManager`: `pnpm@10.30.1`;
  - `engines`: Node `>=22.20.0 <23`, pnpm `>=10.30.1 <11`.

### 3.7 Quality-gate situation

Configured scripts:

- `pnpm lint`: `eslint src/* --ext .ts --no-error-on-unmatched-pattern`
- `pnpm build`: `tsc -p tsconfig.json`
- `pnpm test:local`: `vitest run --exclude "**/*.integration.test.ts"`
- `pnpm test:ci`: `vitest run --exclude "**/*.integration.test.ts"`
- `pnpm test:mqtt`: starts Mosquitto and runs the MQTT integration suite.
- `pnpm test:mqtt:integration`: runs `test/mqtt.integration.test.ts`.
- `pnpm typecheck`: checks both runtime and test TypeScript configs.

CI workflows:

- `.github/workflows/lint.yml`: Node `22.20.0`, Corepack with pnpm `10.30.1`,
  `pnpm install --frozen-lockfile`, then `pnpm lint`.
- `.github/workflows/test.yml`: Node `22.20.0`, Corepack with pnpm `10.30.1`,
  `pnpm install --frozen-lockfile`, then `pnpm test:ci` and
  `pnpm typecheck`; MQTT credentials are supplied from secrets for tests that
  need them.

Observed local gates during the 2026-07-16 refresh:

- `pnpm typecheck`: pass.
- `pnpm test:local`: pass, 12 Vitest tests.
- `pnpm build`: pass.
- `pnpm lint`: pass.

Current gate risk:

- `pnpm lint` now uses Babel's ESLint parser for TypeScript syntax because
  current `@typescript-eslint` releases do not support TS7. Type-aware lint
  rules such as TypeScript-aware unused checks should be revisited when the
  ecosystem supports TS7 or when moving to a different lint stack.
- Mosquitto integration is available locally through `pnpm test:mqtt`, but CI
  does not yet run a Docker-backed broker job.

### 3.8 Deployment/runtime findings

- `Dockerfile` now uses Node 22 Alpine, Corepack, pnpm `10.30.1`,
  `pnpm install --frozen-lockfile`, `pnpm build`, and `pnpm start`.
- `compose.yaml` now defines a local Mosquitto service with config, ACL,
  passwordfile, healthcheck, and broker data/log volumes.
- `infra/mosquitto/**` stores committed broker config/ACL files; generated
  password files remain outside git.
- `.env.example` now includes Node, MQTT lifecycle, Supabase, OpenWA, and
  `MODELS_CDN_URL` variables.
- Deployment/cutover is still pending: production broker operations, CI broker
  job, external broker rollback window, and legacy topic retirement are not yet
  closed.

## 4. Comparison with `simba.js`

Reference inspected:

- `/home/anthony/Development/personal-projects/simba.js`
- Current Simba package version: `9.1.0`.

### 4.1 Concrete inherited patterns in DoorCloud

DoorCloud appears to inherit or preserve these Simba-generated patterns:

| Pattern | DoorCloud evidence | Simba evidence |
| --- | --- | --- |
| Thin entrypoint | `src/index.ts` calls `Server.start()` | Simba example `src/index.ts` does the same |
| Singleton server | `src/network/server.ts` exports `server as Server` | Simba Fastify/Express templates export a singleton server |
| Layered folders | `network`, `schemas`, `services`, `database`, `utils` | Simba README describes presentation/business/persistence layers |
| Absolute imports | imports such as `database`, `services`, `network/http` | Simba README promotes `baseUrl: "src"` absolute imports |
| Default port | `PORT` or `1996` | Simba templates default to `1996` |
| Open CORS headers | `Access-Control-Allow-Origin: *` | Simba templates set the same style of headers |
| `x-powered-by` header | DoorCloud still sends `Simba.js` | Simba templates add `x-powered-by: Simba.js` |
| Response envelope | `response({ error, message, reply, status })` | Simba Fastify response template is equivalent |
| Route registration array/function pattern | `Home`, `User`, `applyRoutes(app)` | Simba Fastify router template uses route functions |
| Fastify schema validation | DoorCloud has a custom validator compiler | Current Simba uses Fastify/Zod type-provider compilers |
| Global clients | Supabase, MQTT, Human stored on `global`; OpenWA is stateless HTTP | Simba examples use global DB client patterns |

### 4.2 Outdated structural assumptions

DoorCloud differs from current Simba in ways that matter for modernization:

- Runtime baseline:
  - DoorCloud: Node `>=22.20.0 <23`, pnpm `>=10.30.1 <11`.
  - Simba: Node `>=20`, npm `>=8`; current Docker template uses
    `node:22-alpine`.
- Tooling:
  - DoorCloud: TypeScript 7, ESLint + Babel parser, Prettier, Vitest, and
    `tsx`.
  - Current Simba generated Express example: Biome + Vitest + `tsx`.
- Fastify/Zod integration:
  - DoorCloud: `fastify-type-provider-zod` with validator and serializer
    compilers.
  - Current Simba Fastify template: `fastify-type-provider-zod` with validator
    and serializer compilers, plus generated docs.
- API docs:
  - DoorCloud has no Swagger/OpenAPI route.
  - Current Simba templates include docs routes.
- Docker:
  - DoorCloud Dockerfile and CI workflows now use the Node 22/pnpm baseline.
  - Current Simba Dockerfile is simpler and package-manager-aware.
- Release tooling:
  - DoorCloud uses `standard-version`.
  - Current Simba uses `commit-and-tag-version`.
- Tests:
  - DoorCloud has a working Vitest baseline locally and CI now runs Vitest plus
    typecheck on the Node 22/pnpm 10 baseline.
  - Current Simba examples use HTTP-level Vitest tests against a real server.
- Domain integrations:
  - DoorCloud adds MQTT, Supabase, OpenWA, and ML processing; these are
    DoorCloud-specific and should not be blindly regenerated from Simba.

### 4.3 Modernization opportunities from Simba

Recommended future alignment points:

1. Raise the runtime baseline to Node 20 or 22 after confirming
   `tfjs-node`/Human native compatibility.
2. Keep `tsx` for dev/local execution and run compiled JS in production.
3. Add an explicit `typecheck` script (`tsc --noEmit`) before package upgrades.
4. Revisit Fastify/Zod integration with `fastify-type-provider-zod`.
5. Add API docs once schemas and response contracts are stable.
6. Remove or customize the `x-powered-by: Simba.js` header.
7. Make Docker package-manager-aware and use pnpm consistently.
8. Keep the layered structure if it remains useful, but isolate MQTT broker
   configuration and message contracts from HTTP concerns.

## 5. SkyTech MQTT/Mosquitto comparison

Reference inspected:

- `/home/anthony/Development/SkyTech/SkyTech`

### 5.1 Findings

No MQTT/Mosquitto/local broker implementation was found in this path.

Evidence from the inspected repository:

- `package.json` describes an Astro project with scripts:
  - `astro dev`;
  - `astro check && astro build`;
  - `astro preview`.
- Dependencies are frontend/static-site oriented:
  - Astro;
  - React;
  - Tailwind;
  - EmailJS;
  - Sharp.
- No MQTT package, Mosquitto config, Dockerfile, Docker Compose file, broker
  config, broker volume, topic handling, publish, or subscribe code was found.
- Searching for MQTT, Mosquitto, broker, Docker, compose, publish, and subscribe
  found no relevant application implementation.

### 5.2 Reusable patterns

Limited reusable process patterns:

- A build script that runs a check before build:
  `astro check && astro build`.
- Ignoring local env files in `.gitignore`.

### 5.3 Differences from DoorCloud

SkyTech is a static Astro/React site; DoorCloud is a long-running Node backend.
DoorCloud must handle concerns that SkyTech does not:

- long-lived MQTT connections;
- reconnect/backoff/session lifecycle;
- topic ACLs and broker auth;
- large binary/base64 image payloads;
- Supabase and WhatsApp/OpenWA side effects;
- ML model loading;
- integration tests with a broker;
- deployment of a broker next to the backend.

### 5.4 Planning implication

The SkyTech path does not provide the expected Mosquitto precedent. Either the
intended reference is in another branch/path, or the remembered implementation
is not present locally. For DoorCloud, the Mosquitto plan below should be used
as a new design unless a different SkyTech reference is supplied later.

## 6. Mosquitto/local MQTT migration plan

Goal for the implementation stage: remove reliance on an externally managed
MQTT server for data processing while preserving MQTT compatibility for the
DoorCloud device/backend flow.

### Phase 0: Baseline and contracts

Deliverables:

- Document current topics, payloads, QoS expectations, and device publishers.
- Decide canonical topic namespace, for example:
  - `doorcloud/v1/photo/send`;
  - `doorcloud/v1/photo/metrics`;
  - `doorcloud/v1/photo/result`;
  - optional legacy aliases for `DoorCloud/photo/#`.
- Define payload schemas. Prefer JSON metadata plus an image reference where
  possible; if base64 over MQTT remains necessary, document max payload size.
- Add env validation design:
  - `MQTT_URL`;
  - `MQTT_PROTOCOL`;
  - `MQTT_HOST`;
  - `MQTT_PORT`;
  - `MQTT_USERNAME`;
  - `MQTT_PASSWORD`;
  - `MQTT_CA_PATH` / cert/key paths for TLS;
  - `MQTT_CLIENT_ID`;
  - `MQTT_CLEAN`;
  - `MQTT_QOS`;
  - `MQTT_LEGACY_TOPICS_ENABLED`.
- Repair tests enough to provide a baseline before changing behavior.

Quality gates:

- install with the chosen pnpm version using a frozen lockfile;
- `pnpm lint`;
- `pnpm test:local`;
- add/then run `pnpm typecheck`.

Rollback:

- no runtime change in this phase; rollback is deleting the planning/config
  branch.

### Phase 1: Add local Mosquitto for development and CI

Deliverables:

- Add a future `docker-compose.yml` service for Mosquitto:
  - internal listener on `1883`;
  - optional external TLS listener on `8883`;
  - named volume for broker persistence if needed;
  - health check using `mosquitto_sub`/`mosquitto_pub` or a TCP check;
  - mounted config, password file, and ACL file.
- Add `mosquitto.conf` with:
  - `allow_anonymous false`;
  - password file;
  - ACL file;
  - persistence location;
  - logging to stdout for containers;
  - conservative message-size limits.
- Add local dev env example values pointing backend to `mqtt://mosquitto:1883`
  inside Compose and `mqtt://localhost:1883` outside Compose.

Security requirements:

- Do not commit generated password files with real credentials.
- Use least-privilege ACLs:
  - backend user can read `doorcloud/v1/photo/#` and write results/acks;
  - device user can write send/metrics topics and read only its result topics.
- Keep TLS enabled for any broker endpoint exposed outside a private network.

Quality gates:

- `docker compose config`;
- broker starts and accepts authenticated pub/sub;
- backend can connect to local Mosquitto;
- no anonymous pub/sub.

Rollback:

- keep the old external broker env vars; switch `MQTT_URL`/host back to the
  external broker and stop the local broker.

### Phase 2: Refactor MQTT client lifecycle

Deliverables:

- Centralize MQTT config parsing and validation.
- Support both `mqtt://` and `mqtts://`.
- Set explicit:
  - `clientId`;
  - `keepalive`;
  - reconnect period/backoff;
  - clean session behavior;
  - QoS defaults;
  - connection timeout.
- Add connect/error/reconnect/close/offline logging.
- Make subscription registration idempotent.
- Add graceful shutdown that unsubscribes/ends the client.
- Avoid throwing directly from `message` handlers; route errors to logs,
  metrics, and optional dead-letter topics.

Compatibility:

- Keep current `MQTT_HOST`/`MQTT_PORT` variables during one transition release,
  but prefer `MQTT_URL`.
- Optionally subscribe to both legacy `DoorCloud/photo/#` and new
  `doorcloud/v1/photo/#` during migration.

Quality gates:

- unit tests for config validation;
- unit tests for subscription registration;
- MQTT integration test against local Mosquitto;
- manual pub/sub smoke test using both legacy and new topics while compatibility
  is enabled.

Rollback:

- set compatibility flags back to legacy topics;
- revert the MQTT client commit if connection behavior changes unexpectedly.

### Phase 3: Payload and processing hardening

Deliverables:

- Replace delimiter-based parsing with schema-validated messages.
- Define maximum image size and reject oversize payloads.
- Consider moving image bytes out of MQTT:
  - device uploads to object storage and publishes a signed/object reference; or
  - device publishes compact JSON metadata and backend retrieves image from a
    controlled endpoint.
- Add acknowledgement/result topics:
  - accepted;
  - rejected;
  - processing failed;
  - match result.
- Add correlation IDs to support retries and duplicate detection.
- Add metrics for:
  - message received;
  - decode/validation errors;
  - processing duration;
  - OpenWA send result;
  - face-match result.

Quality gates:

- contract tests for valid/invalid payloads;
- load test with representative photo sizes;
- duplicate-message tests;
- OpenWA/Supabase mocked tests for side effects.

Rollback:

- keep old delimiter parser behind a compatibility flag for one release.

### Phase 4: Deployment cutover

Deliverables:

- Deploy Mosquitto with persistent config, credentials, and ACLs.
- If devices cannot all switch at once, use a temporary Mosquitto bridge to the
  external broker:
  - bridge legacy external topics into local topics;
  - validate duplicate behavior;
  - remove bridge after device cutover.
- Update devices or gateways to point to local broker endpoint.
- Monitor broker and backend:
  - connected clients;
  - subscription counts;
  - message rates;
  - rejected auth attempts;
  - processing latency;
  - broker disk usage if persistence is enabled.

Quality gates:

- staging cutover with test devices;
- production canary device;
- compare message counts between external and local paths;
- verify no secrets in logs.

Rollback:

1. Repoint devices/backend to external broker env vars.
2. Disable Mosquitto bridge if it causes duplicates.
3. Revert application MQTT config to previous release.
4. Preserve broker logs for incident analysis.

### Phase 5: Remove external-broker dependency

Deliverables:

- Remove legacy external-broker-only assumptions.
- Remove legacy topic subscriptions once all publishers are migrated.
- Document local broker operations:
  - credential rotation;
  - ACL changes;
  - backup/restore if persistence is used;
  - TLS renewal;
  - incident rollback.
- Add a CI integration job that starts Mosquitto for MQTT tests.

Quality gates:

- full test suite;
- broker integration tests;
- Docker/Compose smoke test;
- manual end-to-end photo flow.

Rollback:

- retain the last known external-broker compatible release/tag until the new
  broker has survived an agreed production window.

## 7. Mosquitto alternatives and tradeoffs

Primary candidate: Mosquitto.

Pros:

- small and mature MQTT broker;
- simple Docker deployment;
- supports password files, ACLs, TLS, persistence, and bridges;
- good fit for a single-service local broker migration.

Risks:

- operational responsibility moves into this project/deployment;
- ACL/password/TLS management must be maintained;
- clustering/high availability is limited compared with larger brokers;
- persistence and large retained messages can fill disks if misconfigured.

Alternatives:

| Alternative | When to consider | Tradeoffs |
| --- | --- | --- |
| Aedes embedded broker | Very small local-only deployments or tests | Embeds broker in Node process; fewer operational dependencies but couples broker lifetime to backend and has fewer mature ops features |
| EMQX | Need dashboard, clustering, auth integrations, enterprise broker features | Heavier than Mosquitto; more operational surface |
| VerneMQ | Need scalable clustered MQTT | More complex deployment than Mosquitto |
| NATS / Redis Streams / RabbitMQ | Willing to change protocol away from MQTT | Requires device/client changes; may improve backend processing semantics |
| Direct HTTP upload + queue | Photos are too large for MQTT | More protocol change; often cleaner for image payloads |
| Supabase Storage upload + MQTT metadata | Keep MQTT for events, not bytes | Requires device/gateway ability to upload to storage |

Recommendation:

- Use Mosquitto for the first local-broker implementation.
- Avoid using MQTT as the long-term carrier for large base64 images if devices
  can instead publish image references.

## 8. Security, compatibility, and operational risks

Security risks:

- Broker credentials are currently just environment variables; no rotation or
  ACL model is documented.
- Hard-coded `mqtts` without explicit CA/cert config can encourage insecure
  workarounds during local testing.
- Open CORS and `Access-Control-Allow-Origin: *` should be revisited for HTTP
  endpoints.
- `.env.example` now documents OpenWA and model settings.
- MQTT payloads are not schema validated before decoding.

Compatibility risks:

- Current device/topic contract is not documented outside code and README.
- `src/pub.ts` publishes to a topic that does not match active subscriptions.
- Existing tests appear stale relative to current file layout.
- Moving to Fastify 5, Zod 4, MQTT.js 5, OpenWA, and newer TypeScript should
  be handled in separate commits/phases.

Operational risks:

- Local Mosquitto becomes part of the production availability path.
- Large photos over MQTT can increase memory pressure and broker disk usage.
- `tfjs-node` native bindings may constrain Node version upgrades.
- Dockerfile is currently inconsistent with pnpm and missing `build` script.
- CI only provides MQTT secrets; Supabase/OpenWA/model env assumptions are not
  fully represented.

Mitigations:

- Add env validation and fail fast on missing required variables.
- Add broker health checks and observability.
- Add integration tests with real Mosquitto.
- Keep external-broker rollback settings until after production soak.
- Upgrade packages in small phases with validation after each phase.

## 9. Package update plan

### 9.1 Current package-manager context

- Declared package manager: `pnpm@10.30.1`.
- Engine baseline: Node `>=22.20.0 <23`, pnpm `>=10.30.1 <11`.
- `.nvmrc`: `22.20.0`.
- Lockfile: `pnpm-lock.yaml` lockfile version `9.0`.
- Test runner: Vitest `4.1.10`.
- Dockerfile: aligned with Node 22, Corepack, pnpm, `pnpm build`, and
  `pnpm start`.
- CI: aligned with Node `22.20.0`, pnpm `10.30.1`, frozen lockfile installs,
  deterministic lint/test commands, and typecheck.

The package-manager/runtime/CI baseline phase is complete, and the TypeScript 7,
Fastify 5/Zod 4, MQTT.js 5, and OpenWA messaging phases are complete. The next
decision is operational: how to run and monitor OpenWA.

### 9.2 Current vs latest package inventory

Latest versions below were fetched with `npm view <package> version` during the
original planning pass; current ranges were refreshed from the present
`package.json`.

Runtime packages:

| Package | Current range | Latest observed | Notes |
| --- | ---: | ---: | --- |
| `@fastify/cors` | `^11.3.0` | `11.3.0` | Current Fastify 5-compatible baseline |
| `@fastify/multipart` | `^10.1.0` | `10.1.0` | Current Fastify 5-compatible baseline |
| `@fastify/swagger` | `^9.8.1` | `9.8.1` | Peer required by `fastify-type-provider-zod` |
| `@supabase/postgrest-js` | `^1.1.1` | `2.110.6` | May be unnecessary when using `@supabase/supabase-js` |
| `@supabase/supabase-js` | `^2.2.3` | `2.110.6` | Large version gap within v2 |
| `@tensorflow/tfjs-node` | `^4.2.0` | `4.22.0` | Native/runtime compatibility risk |
| `@vladmandic/human` | `^3.0.3` | `3.3.6` | Validate model loading and matching thresholds |
| `debug` | `^4.3.4` | `4.4.3` | Low-risk |
| `fastify` | `^5.10.0` | `5.10.0` | Current server baseline |
| `fastify-type-provider-zod` | `7.0.0` | `7.0.0` | Current Zod provider baseline |
| `http-errors` | `^2.0.0` | `2.0.1` | Low-risk |
| `mqtt` | `^5.15.2` | `5.15.2` | Current MQTT.js baseline |
| `pino-pretty` | `^9.1.1` | `13.1.3` | Check Fastify/Pino transport compatibility |
| `zod` | `^4.4.3` | `4.4.3` | Current validation baseline |

Development packages:

| Package | Current range | Latest observed | Notes |
| --- | ---: | ---: | --- |
| `@babel/core` | `^7.29.7` | `7.29.7` | Used by ESLint parser for TS7 syntax |
| `@babel/eslint-parser` | `^7.29.7` | `7.29.7` | Replaces `@typescript-eslint/parser` until TS7 support lands |
| `@babel/preset-typescript` | `^7.29.7` | `7.29.7` | Parses TypeScript syntax for ESLint |
| `@types/debug` | `^4.1.7` | `4.1.13` | Low-risk |
| `@types/http-errors` | `^2.0.1` | `2.0.5` | Low-risk |
| `@types/node` | `^22.20.1` | `26.1.1` | Keep matched to chosen Node runtime |
| `dotenv` | `^16.0.3` | `17.4.2` | Low/medium risk |
| `eslint` | `^8.31.0` | `10.7.0` | Major; config migration likely |
| `eslint-config-prettier` | `^8.5.0` | `10.1.8` | Pair with ESLint/Prettier |
| `eslint-config-standard` | `^17.0.0` | `17.1.0` | Evaluate continued use |
| `eslint-plugin-import` | `^2.26.0` | `2.32.0` | Pair with ESLint |
| `eslint-plugin-n` | `^15.6.0` | `18.2.2` | Pair with ESLint |
| `eslint-plugin-prettier` | `^4.2.1` | `5.5.6` | Pair with Prettier 3 |
| `eslint-plugin-promise` | `^6.1.1` | `7.3.0` | Pair with ESLint |
| `nodemon` | `^2.0.20` | `3.1.14` | Low/medium risk |
| `prettier` | `^2.8.1` | `3.9.5` | Formatting changes |
| `standard-version` | `^9.5.0` | `9.5.0` | Consider `commit-and-tag-version` |
| `tsx` | `^4.23.1` | `4.23.1` | Current dev/local TS runtime |
| `typescript` | `^7.0.2` | `7.0.2` | Current compiler baseline |
| `vitest` | `^4.1.10` | `4.1.10` | Current test runner baseline |

Python metrics packages in `requirements.txt` are also old and should be treated
as a separate, optional metrics-tooling update.

### 9.3 Remaining dependency groups and likely breaking areas

Completed P0 baseline work:

- ambient globals from `src/@types` were removed;
- Supabase row types and MQTT route types are explicit exported/imported
  modules;
- `tsconfig.test.json` no longer includes `src/@types/**/*.d.ts`;
- CI now uses Node `22.20.0`, pnpm `10.30.1`, frozen lockfile installs,
  deterministic lint/test commands, and typecheck.

Completed P1 compiler/tooling work:

- TypeScript was upgraded to `7.0.2`.
- Removed compiler options were replaced:
  - `baseUrl` was replaced by `paths`;
  - `downlevelIteration` was removed;
  - `moduleResolution: "node"` became `moduleResolution: "node16"`;
  - `module` became `Node16`.
- `vitest.config.ts` became `vitest.config.mts` to keep the app CommonJS while
  allowing ESM-only `vitest/config`.
- ESLint now uses `@babel/eslint-parser` plus `@babel/preset-typescript`
  because `@typescript-eslint` currently crashes/declares unsupported peers
  with TS7.

Completed P2 Fastify/Zod work:

- Fastify was upgraded to `5.10.0`.
- `@fastify/cors` and `@fastify/multipart` were upgraded to Fastify
  5-compatible versions.
- Zod was upgraded to `4.4.3`.
- `fastify-zod`, direct `ajv`, and direct `@fastify/busboy` dependencies were
  removed.
- `fastify-type-provider-zod` was added, with `@fastify/swagger` to satisfy its
  peer dependency.
- HTTP route schemas now use Zod schemas directly through the provider.
- The old AJV validator compiler was removed in favor of
  `validatorCompiler`/`serializerCompiler` from `fastify-type-provider-zod`.

Completed P2 MQTT work:

- MQTT.js was upgraded to `5.15.2`.
- Existing client lifecycle code remained compatible with MQTT.js 5.
- MQTT is required. Startup waits for broker connection and route subscriptions
  and fails fast if either step fails.
- `pnpm test:mqtt` was run successfully against local Mosquitto.
- The Mosquitto password-file generator now creates files with the local UID/GID
  and permissions that the Mosquitto container can read.
- The MQTT integration script now defaults to host port `1884` to avoid
  collisions with a local broker already bound to `1883`.

Completed P2 WhatsApp provider work:

- CallMeBot exposes a simple HTTP API:
  `https://api.callmebot.com/whatsapp.php?phone=[phone_number]&text=[message]&apikey=[your_apikey]`.
  It requires an API key obtained for the target WhatsApp number and is best for
  low-volume notifications to a known personal number. It is the simplest path
  if DoorCloud only needs to notify our own number and text/link messages are
  acceptable.
- OpenWA is a self-hosted WhatsApp API gateway with Docker, dashboard, sessions,
  API keys, text/media endpoints, webhooks, and whatsapp-web.js/Baileys engines.
  It is a better fit if media delivery, self-hosting, and operational control
  matter, but it adds a separate service, QR/session operations, storage, and
  unofficial WhatsApp Web automation risk.
- Because image delivery is required, Twilio was replaced with an OpenWA HTTP
  provider instead of being upgraded to Twilio 6.
- DoorCloud now sends greeting text through OpenWA `send-text`.
- DoorCloud now uploads detection result photos to Supabase, signs the URL, and
  sends it through OpenWA `send-image`.
- OpenWA env is optional at boot so `/setup` can be used before the gateway is
  fully configured. `OPENWA_BASE_URL` defaults to `http://localhost:2785`,
  `OPENWA_SESSION_ID` defaults to `main`, and `OPENWA_API_KEY`/`OPENWA_CHAT_ID`
  are required only when setup actions or WhatsApp sends are used.
- `pnpm openwa:qr` creates/starts the configured OpenWA session and saves the
  sign-in QR PNG to `.openwa/qr.png`.
- `/setup` now serves a local browser UI for OpenWA status/start/QR/send-test.
- `/setup/openwa/status`, `/setup/openwa/start`, `/setup/openwa/qr`, and
  `/setup/openwa/send-test` are implemented.
- `/setup/config` stores OpenWA setup values in `.env` and `process.env` so the
  local UI can bootstrap the QR flow.
- `pnpm service` runs the `preservice` script
  (`scripts/openwa/sync-api-key.mjs --optional`) before
  starting the backend; it fills an empty `OPENWA_API_KEY` from
  `/app/data/.api-key` in a running OpenWA Compose service when available.
- OpenWA send success and error behavior is covered by unit tests.

Remaining groups:

1. OpenWA operations:
   - deploy and persist the OpenWA gateway;
   - create a scoped operator API key;
   - pair the WhatsApp session with `/setup` or `pnpm openwa:qr`;
   - monitor session readiness;
   - define restart/session recovery runbooks.
2. Mosquitto cutover/decommission:
   - production deployment and operations;
   - external broker fallback/rollback window;
   - legacy `DoorCloud/photo/#` publisher migration and eventual removal.
3. Lint/format/release:
   - ESLint 8 to newer major and flat-config migration risk;
   - revisit TypeScript-aware lint once `@typescript-eslint` supports TS7;
   - Prettier 2 to 3 formatting churn;
   - `standard-version` maintenance status.
4. ML/native packages:
   - `tfjs-node` binary compatibility with Node 22 and future Node changes;
   - Human model path/loading;
   - face-match threshold regression tests.

### 9.4 Recommended remaining upgrade order

Each item should be a separate future commit/PR with its own validation.

1. OpenWA operations:
   - deploy OpenWA with persistent session data;
   - configure `OPENWA_BASE_URL`, `OPENWA_COMPOSE_SERVICE`,
     `OPENWA_SESSION_ID`, and `OPENWA_CHAT_ID`;
   - sync `OPENWA_API_KEY` from the OpenWA container with
     `pnpm openwa:sync-api-key` or let `pnpm service` do it automatically;
   - generate and scan the session QR with `pnpm openwa:qr`;
   - verify one staging `send-text` and `send-image`;
   - add health monitoring for session readiness.
2. Broker decommission and legacy removal:
   - complete production Mosquitto operations;
   - migrate all publishers to versioned topics;
   - disable/remove legacy topic compatibility after the rollback window.
3. Tooling cleanup:
   - ESLint/Prettier major updates or Biome migration;
   - restore TypeScript-aware lint when TS7 support is available;
   - reconsider release tooling.
4. ML/native update:
   - validate on target Node and Docker image;
   - compare face-match outputs against fixtures.

### 9.5 Raspberry Pi local deployment and setup UX

Target deployment shape:

- Raspberry Pi runs DoorCloud backend, OpenWA, and Mosquitto on the local
  network, preferably through Docker Compose.
- OpenWA data is mounted on a persistent volume so the WhatsApp session survives
  restarts and upgrades.
- Mosquitto keeps its config/ACL/passwordfile outside image layers and persists
  broker data/logs where needed.
- DoorCloud exposes a local setup surface over LAN, for example
  `http://doorcloud.local:1996/setup` or the Raspberry Pi IP address.
- Optional later enhancement: make the Raspberry Pi expose an initial WiFi
  access point/captive setup mode, then join the user's WiFi after
  configuration.

Local setup flow:

1. User connects a computer or phone to the Raspberry Pi on the same WiFi/LAN.
2. User opens the DoorCloud setup UI.
3. Setup UI stores or validates:
   - `OPENWA_BASE_URL`;
   - `OPENWA_API_KEY`;
   - `OPENWA_SESSION_ID`;
   - `OPENWA_CHAT_ID`;
   - MQTT local broker settings;
   - any Supabase/model settings required by the current deployment.
4. Setup UI calls backend setup endpoints for OpenWA session status/start/QR.
5. Backend calls OpenWA:
   - `POST /api/sessions` if the session does not exist;
   - `POST /api/sessions/:id/start`;
   - `GET /api/sessions/:id/qr`.
6. UI renders the QR code for the user to scan with the WhatsApp account that
   should send DoorCloud notifications.
7. After QR scan, setup UI polls OpenWA session status until it is ready.
8. Setup UI sends a test text and test image to `OPENWA_CHAT_ID`.

Implementation backlog for setup UX:

1. Add optional `POST /setup/config` for local config persistence.
2. Expand the current `/setup` UI into a complete local setup flow for Raspberry
   Pi installs.
3. Consider local-only binding, setup PIN rotation, one-time token, or explicit
   setup-mode flag so QR/API key access is not exposed accidentally beyond LAN.
4. Document Raspberry Pi Compose profiles and volume backup/restore for OpenWA
   session data.

Tests to run when hardware/OpenWA is available:

1. Raspberry Pi boots services from clean volumes.
2. Setup UI creates/starts OpenWA session and displays QR.
3. User scans QR and OpenWA reaches `ready`.
4. DoorCloud sends one text message to `OPENWA_CHAT_ID`.
5. DoorCloud sends one image message to `OPENWA_CHAT_ID`.
6. Raspberry Pi reboots and OpenWA remains authenticated without a new QR.
7. OpenWA volume deletion forces a new QR as expected.
8. Mosquitto local publish/subscribe flow still passes on the Raspberry Pi.
10. Docker/CI production hardening:
    - pnpm-based Dockerfile;
    - no missing build script;
    - Compose smoke tests including Mosquitto.

### 9.6 Inspection/apply commands for future package work

Inspection:

```bash
corepack enable
pnpm --version
node --version
pnpm list --depth 0
pnpm outdated
npm view <package> version
pnpm why <package>
```

Conservative install with existing lockfile:

```bash
corepack prepare pnpm@7.33.7 --activate
pnpm install --frozen-lockfile
```

Modern package-manager phase:

```bash
corepack prepare pnpm@latest --activate
pnpm pkg set packageManager="pnpm@<chosen-version>"
pnpm pkg set engines.pnpm=">=<chosen-major>"
pnpm install
git diff -- package.json pnpm-lock.yaml
```

Patch/minor update phase:

```bash
pnpm update
pnpm lint
pnpm test:local
pnpm typecheck
```

Interactive/major planning:

```bash
pnpm update --interactive --latest
pnpm add fastify@latest @fastify/cors@latest @fastify/multipart@latest
pnpm add mqtt@latest
pnpm add -D typescript@latest @types/node@latest
pnpm add -D vitest
```

Security and cleanup:

```bash
pnpm audit
pnpm why @supabase/postgrest-js
```

### 9.7 Validation gates after each update phase

Minimum after every package phase:

1. `pnpm install --frozen-lockfile`
2. `pnpm lint`
3. `pnpm test:local`
4. `pnpm typecheck`
5. `git diff --check`

MQTT/Mosquitto-specific:

1. `docker compose config`
2. start Mosquitto and backend in a disposable environment
3. authenticated `mosquitto_pub`/`mosquitto_sub` smoke test
4. backend integration test receives a valid photo message
5. invalid payload test is rejected and logged without process crash
6. rollback env points backend back to external broker

HTTP/Supabase/OpenWA:

1. Fastify route tests with mocked services
2. Supabase query/storage mock tests
3. OpenWA HTTP client mock tests
4. one staging end-to-end run with non-production credentials

ML:

1. model initialization test on target Node/Docker image
2. fixture-based face-match regression test
3. performance check against current `metrics` baseline

Docker/CI:

1. Docker image builds without Yarn if pnpm is the chosen package manager
2. image starts with required env validation
3. CI runs install/lint/test/typecheck
4. no workflow auto-fixes commit unexpected source changes

### 9.8 Package rollback guidance

- Keep one logical upgrade per commit/PR.
- Tag or record the last green baseline before major upgrades.
- If a package phase fails:
  1. `git revert` that phase commit;
  2. reinstall with frozen lockfile;
  3. rerun lint/test/typecheck;
  4. record the breaking package and error.
- For Mosquitto rollout:
  - keep external broker variables available;
  - keep legacy topic subscriptions during the transition;
  - disable broker bridge first if duplicate messages appear;
  - then roll backend/device endpoints back to the external broker.

## 10. Recommended next implementation backlog

P0 — complete:

1. Ambient `src/@types` globals were replaced by explicit modules:
   - `src/database/supabase/types.ts` exports `UserSupabase`;
   - `src/network/mqtt/types.ts` exports `MqttRoute`;
   - call sites import those types explicitly.
2. `tsconfig.test.json` no longer includes `src/@types/**/*.d.ts`.
3. CI now uses Node `22.20.0`, pnpm `10.30.1`, frozen lockfile installs,
   deterministic `pnpm lint`/`pnpm test:ci`, and `pnpm typecheck`.

P1 — complete:

1. TypeScript was upgraded to `7.0.2`.
2. `tsconfig.base.json` was updated for TS7 removals:
   - `baseUrl` replaced by `paths`;
   - `downlevelIteration` removed;
   - `moduleResolution` changed to `node16`;
   - `module` changed to `Node16`.
3. `vitest.config.ts` became `vitest.config.mts` for ESM `vitest/config`.
4. ESLint stayed on ESLint 8 but now parses TypeScript through Babel because
   `@typescript-eslint` does not yet support TS7.
5. Fastify, Zod, and MQTT.js majors stayed unchanged until their dedicated P2
   steps; Twilio was later removed in favor of OpenWA.

P2 — application dependency majors:

1. Fastify 5 + Zod 4/provider migration is complete:
   - `fastify-zod` was replaced with `fastify-type-provider-zod`;
   - Zod schemas are used directly in route schemas;
   - custom AJV validation was removed.
2. MQTT.js 5 is complete:
   - `mqtt` was upgraded to `5.15.2`;
   - Mosquitto integration tests pass with MQTT.js 5.
3. Twilio replacement is complete:
   - Twilio env/dependency/client code was removed;
   - OpenWA handles text and image messages;
   - CallMeBot was not selected because image delivery is required.

P3 — operational cleanup:

1. Finish Mosquitto production cutover/decommission:
   - external broker fallback/rollback window;
   - all publishers migrated to `doorcloud/v1/photo/*`;
   - remove legacy `DoorCloud/photo/#` compatibility when safe.
2. Add or update CI for Mosquitto integration tests if Docker is available.
3. Revisit open CORS and `x-powered-by: Simba.js`.
4. Consider ESLint/Prettier major updates, Biome/tsx alignment with current
   Simba, and release-tooling cleanup.

## 11. Acceptance checklist

- Current DoorCloud architecture, key modules, data-processing flow, MQTT usage,
  package/dependency surface, and quality-gate situation: covered in sections
  3 and 9.
- Comparison with `/home/anthony/Development/personal-projects/simba.js`:
  covered in section 4.
- Examination of `/home/anthony/Development/SkyTech/SkyTech`: covered in
  section 5, including the finding that no MQTT/Mosquitto implementation exists
  at that path.
- Phased Mosquitto/local MQTT migration plan with alternatives, deployment,
  security, compatibility, risks, rollback, and test strategy: covered in
  sections 6, 7, and 8.
- Complete package-update strategy with context, groups, breaking areas, order,
  commands, validation, and rollback: covered in section 9.
- Original planning scope was respected in the initial goal stage; subsequent
  refreshes now track implementation progress such as P0 completion.
