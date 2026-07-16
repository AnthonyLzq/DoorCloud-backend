# DoorCloud-backend review and migration plan

Date: 2026-07-15
Scope: planning only; no product source, dependency manifest, lockfile, env,
deployment, or runtime behavior changes.

## 1. Executive summary

DoorCloud-backend is a small TypeScript/Fastify service that combines:

- an HTTP API for creating users and uploading reference photos;
- a long-lived MQTT client that subscribes to photo-processing topics;
- Supabase for user records and photo storage;
- Twilio WhatsApp messaging;
- `@vladmandic/human` / TensorFlow face comparison; and
- CSV/PNG metric artifacts.

The code still carries clear `simba.js` generator assumptions: a singleton
`Server`, layered folders (`network`, `schemas`, `services`, `database`),
absolute imports from `src`, a `{ error, message }` response envelope, default
port `1996`, open CORS, and the `x-powered-by: Simba.js` header.

The MQTT path is currently only a client of an externally managed TLS broker
(`protocol: "mqtts"`, `MQTT_HOST`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASS`). There
is no local broker configuration, no Docker Compose service, no Mosquitto
configuration, no topic ACLs, no broker persistence plan, and no integration
test that starts a broker. Mosquitto is a good primary candidate for the next
implementation stage because it is small, well known, easy to run in Docker,
supports TLS/password/ACLs/bridging, and can preserve MQTT compatibility while
removing the externally managed broker dependency.

The requested SkyTech reference at `/home/anthony/Development/SkyTech/SkyTech`
does **not** contain MQTT, Mosquitto, Docker, Compose, broker, publish, or
subscribe implementation. It appears to be an Astro/React static site. That
means the DoorCloud Mosquitto design should be treated as new infrastructure,
not a direct port from SkyTech.

Package modernization should be phased. The project is on a 2022/2023 stack
with `pnpm` lockfile v5.4, Node engine `>=16`, Fastify 4, MQTT.js 4,
TypeScript 4.9, ESLint 8, Jest 29, Twilio 3, and old native ML packages. The
local machine has Node `v24.13.1` and pnpm `10.30.1`; `pnpm outdated` failed
against this old lockfile, so the first future package phase should pin/choose
the package-manager and Node baseline before upgrading dependencies.

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
- `src/integrations/twilio/**`: Twilio client singleton and WhatsApp helpers.
- `src/lib/human/index.ts`: Human/TensorFlow initialization and face matching.
- `metrics/**` and `scripts/histogramForMetrics.py`: metrics collection and
  plotting artifacts.

The service boots as:

1. `src/index.ts` calls `Server.start()`.
2. `Server.start()` creates or reuses Supabase and Twilio clients.
3. `Server.start()` starts the MQTT route registration through
   `mqttConnection(...).start()`.
4. Fastify listens on `PORT` or `1996`.
5. Human/TensorFlow models are initialized after the HTTP server starts.

### 3.2 HTTP API

`src/network/server.ts` configures Fastify with:

- `@fastify/cors` with open/default settings;
- `@fastify/multipart` with `fields: 3` and `files: 3`;
- Zod-generated user schemas via `fastify-zod`;
- a custom pre-handler setting:
  - `Access-Control-Allow-Methods: GET, POST, PATCH, DELETE`;
  - `Access-Control-Allow-Origin: *`;
  - `Access-Control-Allow-Headers: Authorization, Content-Type`;
  - `x-powered-by: Simba.js`;
- a custom AJV validator compiler from `src/network/http/utils/validatorCompiler.ts`;
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
- `protocol` is hard-coded to `mqtts`.
- `host`, `port`, `username`, and `password` come from environment variables.
- `keepalive` is set to `0`.
- On connect, it logs `Connected to mqtt server`.
- Route registration is dynamic: `src/network/mqtt/router.ts` imports all
  exports from `src/network/mqtt/routes`.

Current MQTT topic constants:

- `PUB_TOPIC = "DoorCloud"`.
- `SUB_TOPIC = "DoorCloud/photo/#"`.

Key gaps to address in the Mosquitto migration:

- no local broker service or config;
- no Docker Compose/Kubernetes/systemd deployment model for a broker;
- no `MQTT_URL` or local default such as `mqtt://mosquitto:1883`;
- hard-coded TLS protocol makes local plaintext development awkward;
- no TLS CA/cert/key configuration despite using `mqtts`;
- no topic ACLs;
- no broker persistence or backup plan;
- no explicit QoS/session/clean/reconnect/backoff strategy;
- no Last Will and Testament;
- no payload schema validation before splitting strings;
- image payloads are large base64 blobs over MQTT;
- errors thrown inside `client.on("message")` can destabilize the process;
- route registration is not obviously idempotent if the singleton is reused in
  tests or hot reloads;
- no MQTT integration tests with a real broker.

### 3.5 Data stores and external services

Supabase:

- `src/database/supabase/connection.ts` creates a global Supabase client from
  `SUPABASE_URL` and `SUPABASE_KEY`.
- Queries operate on a `users` table and `photos` storage bucket.
- Signed URLs are generated with a 900-second lifetime.

Twilio:

- `src/integrations/twilio/connection.ts` creates a global Twilio client from
  `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.
- WhatsApp messages use `TWILIO_PHONE_NUMBER`.
- `.env.example` does not list the Twilio variables.

Human/TensorFlow:

- `src/lib/human/index.ts` creates a global `Human` instance.
- `MODELS_CDN_URL` controls model download location.
- `.env.example` does not list `MODELS_CDN_URL`.

Redis:

- `redis` is declared in `package.json` but no Redis imports or usage were found
  in `src`.

### 3.6 Package/dependency surface

Runtime dependencies in `package.json`:

- Fastify stack: `fastify`, `@fastify/cors`, `@fastify/multipart`,
  `@fastify/busboy`, `fastify-zod`, `ajv`, `http-errors`, `pino-pretty`.
- MQTT: `mqtt`.
- Supabase: `@supabase/supabase-js`, `@supabase/postgrest-js`.
- Messaging: `twilio`.
- ML/image: `@tensorflow/tfjs-node`, `@vladmandic/human`,
  `@vladmandic/face-api`.
- Utilities: `debug`, `zod`, `redis`.

Development dependencies:

- TypeScript runtime/build: `typescript`, `ts-node`, `ts-loader`,
  `tsconfig-paths`, `tsconfig-paths-webpack-plugin`.
- Test: `jest`, `ts-jest`, `@jest/types`, `@types/jest`,
  `jest-mock-extended`, `jest-unit`.
- Lint/format: `eslint`, TypeScript ESLint 5, Prettier 2, Standard-related
  plugins.
- Release: `standard-version`.

Other dependency context:

- `requirements.txt` contains Python plotting/data packages for metrics.
- `pnpm-lock.yaml` is lockfile version `5.4`, consistent with old pnpm 7-era
  workflows.
- Local tool versions observed during this review:
  - Node `v24.13.1`;
  - pnpm `10.30.1`;
  - Python `3.14.5`.

### 3.7 Quality-gate situation

Configured scripts:

- `pnpm lint`: `eslint src/* --ext .ts --no-error-on-unmatched-pattern`
- `pnpm test:local`: `jest --setupFiles dotenv/config --ci -i`
- `pnpm test:ci`: `jest --ci -i`

No project script was found for:

- build;
- typecheck;
- preflight/check.

CI workflows:

- `.github/workflows/lint.yml`: Node 16, `corepack enable`, `pnpm i`, then a
  lint action with `auto_fix: true`.
- `.github/workflows/test.yml`: Node 16, `corepack enable`, `pnpm i`, then
  `pnpm test:ci`; MQTT credentials are supplied from secrets.

Observed local gate attempts in this planning pass:

- `pnpm lint` failed because `eslint` was not found and `node_modules` is
  missing.
- `pnpm test:local` failed because `jest` was not found and `node_modules` is
  missing.
- `pnpm outdated --format json` failed under pnpm `10.30.1` with
  `Cannot read properties of undefined (reading 'optionalDependencies')`,
  which reinforces the need to standardize the pnpm version before package
  upgrade work.

Test-risk findings from static inspection:

- `test/index.test.ts` imports `../src/network/router`, but the current router
  files are under `src/network/http/router.ts` and `src/network/mqtt/router.ts`.
- The same test calls `mqttServer.start()` / `mqttServer.stop()`, but
  `src/network/mqtt/index.ts` exports the MQTT helpers, not top-level
  `start/stop` functions.
- Future modernization should repair the test suite before using it as a
  package-upgrade safety net.

### 3.8 Deployment/runtime findings

- `Dockerfile` uses `node:16-alpine`, `yarn install --prod`, temporary
  webpack packages, `yarn build`, and `yarn start`.
- The repository declares pnpm, has a pnpm lockfile, and has no `build` script.
- This makes the Dockerfile inconsistent with the package-manager and script
  surface.
- No `docker-compose.yml`, Mosquitto config, broker volume, or broker health
  check was found.
- `.env.example` lists MQTT and Supabase variables but omits Twilio,
  `MODELS_CDN_URL`, `PORT`, and any future broker-mode variables.

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
| Global clients | Supabase, Twilio, MQTT, Human stored on `global` | Simba examples use global DB client patterns |

### 4.2 Outdated structural assumptions

DoorCloud differs from current Simba in ways that matter for modernization:

- Runtime baseline:
  - DoorCloud: Node `>=16`, pnpm `>=7`.
  - Simba: Node `>=20`, npm `>=8`; current Docker template uses
    `node:22-alpine`.
- Tooling:
  - DoorCloud: ESLint + Prettier + Jest + `ts-node`.
  - Current Simba generated Express example: Biome + Vitest + `tsx`.
- Fastify/Zod integration:
  - DoorCloud: `fastify-zod` and a custom AJV compiler.
  - Current Simba Fastify template: `fastify-type-provider-zod` with validator
    and serializer compilers, plus generated docs.
- API docs:
  - DoorCloud has no Swagger/OpenAPI route.
  - Current Simba templates include docs routes.
- Docker:
  - DoorCloud Dockerfile mixes pnpm project state with Yarn and a missing build
    script.
  - Current Simba Dockerfile is simpler and package-manager-aware.
- Release tooling:
  - DoorCloud uses `standard-version`.
  - Current Simba uses `commit-and-tag-version`.
- Tests:
  - DoorCloud tests are stale and currently cannot run without dependencies.
  - Current Simba examples use HTTP-level Vitest tests against a real server.
- Domain integrations:
  - DoorCloud adds MQTT, Supabase, Twilio, and ML processing; these are
    DoorCloud-specific and should not be blindly regenerated from Simba.

### 4.3 Modernization opportunities from Simba

Recommended future alignment points:

1. Raise the runtime baseline to Node 20 or 22 after confirming
   `tfjs-node`/Human native compatibility.
2. Replace `ts-node` runtime scripts with `tsx` for dev/local execution, or add
   a real TypeScript build and run compiled JS in production.
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
- Supabase and Twilio side effects;
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
  - Twilio send result;
  - face-match result.

Quality gates:

- contract tests for valid/invalid payloads;
- load test with representative photo sizes;
- duplicate-message tests;
- Twilio/Supabase mocked tests for side effects.

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
- `.env.example` is incomplete for Twilio and model settings.
- MQTT payloads are not schema validated before decoding.

Compatibility risks:

- Current device/topic contract is not documented outside code and README.
- `src/pub.ts` publishes to a topic that does not match active subscriptions.
- Existing tests appear stale relative to current file layout.
- Moving to Fastify 5, Zod 4, MQTT.js 5, Twilio 6, and newer TypeScript should
  be handled in separate commits/phases.

Operational risks:

- Local Mosquitto becomes part of the production availability path.
- Large photos over MQTT can increase memory pressure and broker disk usage.
- `tfjs-node` native bindings may constrain Node version upgrades.
- Dockerfile is currently inconsistent with pnpm and missing `build` script.
- CI only provides MQTT secrets; Supabase/Twilio/model env assumptions are not
  fully represented.

Mitigations:

- Add env validation and fail fast on missing required variables.
- Add broker health checks and observability.
- Add integration tests with real Mosquitto.
- Keep external-broker rollback settings until after production soak.
- Upgrade packages in small phases with validation after each phase.

## 9. Package update plan

### 9.1 Current package-manager context

- Declared package manager expectation: pnpm `>=7`.
- Lockfile: `pnpm-lock.yaml` lockfile version `5.4`.
- Local pnpm used during review: `10.30.1`.
- `pnpm outdated --format json` failed under pnpm 10 against the current repo.
- Dockerfile uses Yarn even though the repo is pnpm-based.

Future package work should first choose one of these paths:

1. Conservative baseline: use pnpm 7.x via Corepack to work with the existing
   lockfile, repair tests, then upgrade packages.
2. Modern baseline: intentionally upgrade the lockfile/package-manager to a
   current pnpm version in its own commit, then upgrade packages.

Recommended: move to a modern pnpm and Node 20/22 baseline in a dedicated
tooling phase, but do not combine that with application dependency upgrades.

### 9.2 Current vs latest package inventory

Latest versions below were fetched with `npm view <package> version` during this
planning pass because `pnpm outdated` failed locally.

Runtime packages:

| Package | Current range | Latest observed | Notes |
| --- | ---: | ---: | --- |
| `@fastify/busboy` | `^1.1.0` | `3.2.0` | Used for multipart types; may be redundant after multipart upgrade |
| `@fastify/cors` | `^8.2.0` | `11.3.0` | Upgrade with Fastify compatibility checks |
| `@fastify/multipart` | `^7.3.0` | `10.1.0` | Breaking changes likely; validate file iterator APIs |
| `@supabase/postgrest-js` | `^1.1.1` | `2.110.6` | May be unnecessary when using `@supabase/supabase-js` |
| `@supabase/supabase-js` | `^2.2.3` | `2.110.6` | Large version gap within v2 |
| `@tensorflow/tfjs-node` | `^4.2.0` | `4.22.0` | Native/runtime compatibility risk |
| `@vladmandic/face-api` | `^1.7.8` | `1.7.15` | No source usage found; confirm before keeping |
| `@vladmandic/human` | `^3.0.3` | `3.3.6` | Validate model loading and matching thresholds |
| `ajv` | `^8.11.2` | `8.20.0` | May be replaced by Fastify/Zod provider path |
| `debug` | `^4.3.4` | `4.4.3` | Low-risk |
| `fastify` | `^4.10.2` | `5.10.0` | Major upgrade; plugin compatibility required |
| `fastify-zod` | `^1.2.0` | `1.4.0` | Consider replacing with `fastify-type-provider-zod` |
| `http-errors` | `^2.0.0` | `2.0.1` | Low-risk |
| `mqtt` | `^4.3.7` | `5.15.2` | Major upgrade; pair with Mosquitto tests |
| `pino-pretty` | `^9.1.1` | `13.1.3` | Check Fastify/Pino transport compatibility |
| `redis` | `^4.5.1` | `6.1.0` | No source usage found; remove if unused |
| `twilio` | `^3.84.0` | `6.0.2` | Major upgrade; API/auth behavior must be tested |
| `zod` | `^3.20.2` | `4.4.3` | Major upgrade; schemas/type-provider changes |

Development packages:

| Package | Current range | Latest observed | Notes |
| --- | ---: | ---: | --- |
| `@jest/types` | `^29.3.1` | `30.4.1` | Pair with Jest upgrade |
| `@types/debug` | `^4.1.7` | `4.1.13` | Low-risk |
| `@types/http-errors` | `^2.0.1` | `2.0.5` | Low-risk |
| `@types/jest` | `^29.2.5` | `30.0.0` | Pair with Jest upgrade |
| `@types/node` | `^18.11.18` | `26.1.1` | Match chosen Node runtime |
| `@typescript-eslint/eslint-plugin` | `^5.47.1` | `8.64.0` | Major with ESLint compatibility |
| `@typescript-eslint/parser` | `^5.47.1` | `8.64.0` | Major with ESLint compatibility |
| `dotenv` | `^16.0.3` | `17.4.2` | Low/medium risk |
| `eslint` | `^8.31.0` | `10.7.0` | Major; config migration likely |
| `eslint-config-prettier` | `^8.5.0` | `10.1.8` | Pair with ESLint/Prettier |
| `eslint-config-standard` | `^17.0.0` | `17.1.0` | Evaluate continued use |
| `eslint-plugin-import` | `^2.26.0` | `2.32.0` | Pair with ESLint |
| `eslint-plugin-jest` | `^27.1.7` | `29.15.4` | Pair with Jest/ESLint |
| `eslint-plugin-n` | `^15.6.0` | `18.2.2` | Pair with ESLint |
| `eslint-plugin-node` | `^11.1.0` | `11.1.0` | Likely obsolete if using `eslint-plugin-n` |
| `eslint-plugin-prettier` | `^4.2.1` | `5.5.6` | Pair with Prettier 3 |
| `eslint-plugin-promise` | `^6.1.1` | `7.3.0` | Pair with ESLint |
| `jest` | `^29.3.1` | `30.4.2` | Repair stale tests first |
| `jest-mock-extended` | `^3.0.1` | `4.0.1` | Pair with Jest/TS |
| `jest-unit` | `^0.0.2` | `0.0.2` | Evaluate removal |
| `nodemon` | `^2.0.20` | `3.1.14` | Low/medium risk |
| `prettier` | `^2.8.1` | `3.9.5` | Formatting changes |
| `reflect-metadata` | `^0.1.13` | `0.2.2` | No source usage found; remove if unused |
| `standard-version` | `^9.5.0` | `9.5.0` | Consider `commit-and-tag-version` |
| `ts-jest` | `^29.0.3` | `29.4.11` | Compatible with Jest 29/30 matrix must be checked |
| `ts-loader` | `^9.4.2` | `9.6.2` | Only needed if Webpack remains |
| `ts-node` | `^10.9.1` | `10.9.2` | Consider replacing dev runtime with `tsx` |
| `tsconfig-paths` | `^4.1.1` | `4.2.0` | Low-risk |
| `tsconfig-paths-webpack-plugin` | `^4.0.0` | `4.2.0` | Only needed if Webpack remains |
| `typescript` | `^4.9.4` | `7.0.2` | Upgrade in controlled steps; current Simba examples use TS 5.x |

Python metrics packages in `requirements.txt` are also old and should be treated
as a separate, optional metrics-tooling update.

### 9.3 Dependency groups and likely breaking areas

1. Package manager / runtime baseline:
   - pnpm lockfile upgrade;
   - Node 20/22 decision;
   - Dockerfile consistency.
2. Test and type safety:
   - repair stale Jest imports;
   - add typecheck;
   - consider Vitest later, but not before tests are green.
3. Fastify and validation:
   - Fastify 4 to 5;
   - `@fastify/cors` and `@fastify/multipart` compatibility;
   - Zod 3 to 4;
   - `fastify-zod` replacement decision;
   - response schema serialization.
4. MQTT:
   - MQTT.js 4 to 5;
   - Mosquitto integration;
   - protocol/config lifecycle changes;
   - QoS and reconnect semantics.
5. Supabase:
   - update `@supabase/supabase-js` within v2;
   - remove direct `@supabase/postgrest-js` unless required.
6. Twilio:
   - Twilio 3 to 6;
   - WhatsApp API behavior and error handling.
7. ML/native packages:
   - `tfjs-node` binary compatibility with chosen Node;
   - Human model path/loading;
   - face-match threshold regression tests.
8. Lint/format/release:
   - ESLint 8 to 10 and flat-config migration risk;
   - Prettier 2 to 3 formatting churn;
   - `standard-version` maintenance status.
9. Unused packages:
   - confirm and remove `redis`, `reflect-metadata`, and possibly
     `@vladmandic/face-api` if not used.

### 9.4 Recommended upgrade order

Each item should be a separate future commit/PR with its own validation.

1. Reproducibility baseline:
   - choose Node 20 or 22;
   - choose pnpm version;
   - install with frozen lockfile;
   - document local setup;
   - fix tests only enough to run.
2. Add missing non-invasive gates:
   - `typecheck`;
   - a smoke test script;
   - broker integration test placeholder if Mosquitto is added next.
3. Patch/minor updates within existing major ranges:
   - low-risk runtime patches;
   - Supabase v2 latest;
   - `debug`, `http-errors`, `ajv`, patch-level ML packages.
4. Remove unused packages:
   - remove only after static search and tests confirm no usage.
5. MQTT/Mosquitto implementation:
   - add local broker and tests while still on MQTT.js 4 if possible;
   - then upgrade to MQTT.js 5 with broker tests in place.
6. Fastify/Zod major upgrade:
   - upgrade Fastify plugins together;
   - migrate validation/provider approach;
   - add response schemas/docs if desired.
7. Twilio major upgrade:
   - mock Twilio tests first;
   - verify WhatsApp sends in staging.
8. Tooling modernization:
   - TypeScript major update;
   - ESLint/Prettier update or Biome migration;
   - Jest 30 or Vitest migration.
9. ML/native update:
   - validate on target Node and Docker image;
   - compare face-match outputs against fixtures.
10. Docker/CI production hardening:
    - pnpm-based Dockerfile;
    - no missing build script;
    - Compose smoke tests including Mosquitto.

### 9.5 Inspection/apply commands for future package work

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
```

Security and cleanup:

```bash
pnpm audit
pnpm why redis
pnpm why reflect-metadata
pnpm why @vladmandic/face-api
```

### 9.6 Validation gates after each update phase

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

HTTP/Supabase/Twilio:

1. Fastify route tests with mocked services
2. Supabase query/storage mock tests
3. Twilio client mock tests
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

### 9.7 Package rollback guidance

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

High priority:

1. Restore reproducible local install and tests.
2. Fix stale `test/index.test.ts` imports/API assumptions.
3. Add `typecheck`.
4. Document and validate all required env vars.
5. Add Mosquitto Compose/config with password/ACL files generated outside git.
6. Add MQTT integration tests using Mosquitto.
7. Refactor MQTT config to support local `mqtt://` and external `mqtts://`.
8. Define versioned topics and payload schemas.

Medium priority:

1. Align Dockerfile with pnpm and actual scripts.
2. Remove unused dependencies.
3. Upgrade low-risk patches/minors.
4. Add API docs/schema responses.
5. Revisit open CORS and `x-powered-by`.

Later/major:

1. Fastify 5 + Zod 4/provider migration.
2. MQTT.js 5 upgrade.
3. Twilio 6 upgrade.
4. Node 22 runtime after ML validation.
5. Biome/Vitest/tsx migration if desired to align with current Simba.

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
- Scope boundary respected: this stage is a planning artifact only.
