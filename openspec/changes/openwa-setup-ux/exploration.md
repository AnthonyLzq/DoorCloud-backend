# Exploration: OpenWA Setup Page UX (auto-poll + auto-load QR)

## Current State

The setup page is a self-contained HTML string rendered by `renderSetupHtml`
in `src/network/http/routes/setup.ts` (lines 40-151). It is vanilla JS, no
framework, served at `GET /setup`. All OpenWA endpoints are in the same file
under `setupAuthMiddleware` except the HTML page.

Current JS flow:

- `request()` helper: fetch + JSON parse + error handling, returns
  `data.message` (the API envelope is `{ error, message }`).
- `refreshStatus()`: GET `/setup/openwa/status` then `showStatus(data)` which
  dumps the whole payload into `<pre id="status">`.
- Start button: POST `/setup/openwa/start` then `showStatus(...)`.
- QR button: GET `/setup/openwa/qr` then sets `<img id="qr">` src and shows it.
- On load: single `refreshStatus()` call.

There is NO loading state and NO polling today. The user must click
"Refresh status" repeatedly and manually click "Load QR" once status shows
`qr_ready`.

Backend (`src/integrations/whatsapp/setup.ts`):

- `getOpenWaSetupStatus` returns `{ configured, configuredChatId,
  configuredSessionId, missing, session }` where `session` is the OpenWA
  session object `{ id, name?, phone?, status? }` or `null`.
- `startOpenWaSetupSession` ensures the session exists (creates it), POSTs
  `/api/sessions/{id}/start` (400/409 tolerated), then returns fresh status.
- `getOpenWaSetupQr` now (commit d89e006) starts the session first, then
  GETs `/api/sessions/{id}/qr`, returning `{ qrCode, status }`.

Session statuses seen: `created`, `qr_ready`, `connected`, `disconnected`
(status is passed through verbatim from the OpenWA gateway; the exact enum
comes from OpenWA, not from this repo). OpenWA also has a CLI flow
(`scripts/openwa/qr-sign-in.mjs`) that polls the QR endpoint directly every
1s for up to 30s — an established poll-until-ready pattern in the repo.

## Affected Areas

- `src/network/http/routes/setup.ts` — the HTML/JS block (`renderSetupHtml`,
  lines 40-151) is the ONLY thing that needs to change. Route handlers stay
  the same.
- `src/integrations/whatsapp/setup.ts` — likely NO change; read-only
  reference for what statuses/QR payloads look like.
- `test/index.test.ts` — the OpenWA setup tests (lines ~478-626) cover
  backend functions only (fetch mocks). The embedded HTML/JS is NOT covered
  by any test today. A frontend-behavior test would need the JS extracted or
  a DOM/HTML assertion on the rendered string.
- `docs/ai/MESSAGE_FLOWS.md`, `README.md` — the documented order
  "Start session first, then Load QR" (README lines 297-302) stays correct
  but the manual-step guidance may become stale after auto-load.

## Approaches

### 1. Frontend-only auto-poll in the embedded HTML (recommended)

Add a polling loop to the inline JS:

- On "Start session" click: disable button + spinner/text ("Starting..."),
  POST start, then start polling every ~3s via recursive `setTimeout` (not
  `setInterval`, to avoid overlapping requests when the endpoint is slow).
- Poll handler GETs `/setup/openwa/status`; branches on `session.status`:
  - `qr_ready` → stop poll, auto-GET `/setup/openwa/qr`, set img src, show it.
  - `connected` → stop poll, show "Connected" (no QR needed).
  - `disconnected` / `created` / other → keep polling, update status text.
  - `session === null` → stop poll, show message (config missing / not started).
  - request failure → show error, stop poll (or keep a failure counter and
    stop after 3 consecutive failures).
- Manual "Refresh status" and "Load QR" buttons remain available.
- A `polling` guard flag prevents double polls if start is clicked twice.
- On initial page load, run one status check; if it already shows `qr_ready`
  or `connected`, optionally auto-load QR / stop. Keep it simple: only start
  polling after the user clicks Start (matches the user's requested flow),
  but ALSO auto-load QR if the initial status is already `qr_ready`.

Pros:

- Zero backend change; purely additive JS in one file.
- Matches existing architecture (embedded page, no framework).
- Reuses existing endpoints exactly as they are.
- Recursive setTimeout + guard flag is a standard, testable pattern.

Cons:

- Vanilla JS embedded in a template string — harder to unit test (see
  Approach 3 for mitigation).
- Status `<pre>` gets rewritten every poll; need to keep the text readable
  (e.g. add a "waiting for QR..." line without spamming JSON every tick).

Effort: Low

### 2. Backend-assisted: add a dedicated "wait until QR" endpoint

Add e.g. `GET /setup/openwa/wait-qr` that internally polls OpenWA
(similar to `qr-sign-in.mjs`'s 30x1s loop) and returns the QR once ready.
Frontend would call it once with a loading spinner.

Pros:

- Frontend gets simpler: one call, one loading state, no polling loop.
- Logic collocated with existing OpenWA integration + existing tests style.

Cons:

- Long-held HTTP request (up to ~30s) — poor for proxies/timeouts; keeps the
  connection open and ties up a Fastify handler.
- Duplicates the CLI polling logic server-side.
- Does NOT fix the "already connected" or "session died mid-flow" cases
  without more branching.

Effort: Medium

### 3. Extract the JS into a testable module (complements 1 or 2)

Pull the polling/status logic out of the template into
`src/network/http/setup-ui.ts` (a small state machine: idle → starting →
polling → qr_ready/connected/error) and have the HTML call it. Unit-test it
with Vitest fake timers + mocked fetch, mirroring the existing fetch-mock
test style.

Pros:

- The UX logic becomes unit-testable (the repo's test infra already mocks
  fetch; fake timers for setTimeout are standard Vitest).
- Keeps route handlers unchanged.

Cons:

- More moving parts for a small page; template string must be split or
  import the module in-browser (no bundler for this page today — would need
  an inline `<script type="module">` import or a small static file).

Effort: Medium

## Recommendation

**Approach 1, with the poll/state logic extracted per Approach 3 if we want
automated coverage** — otherwise keep it inline and rely on manual
verification. This is frontend-only, no backend changes, and matches the
user's exact ask (loading indicator → poll every ~3s → auto-load QR). The
CLI `qr-sign-in.mjs` already proves the "poll until ready" pattern works
against this gateway.

Concrete UX flow:

1. User clicks **Start session** → button disabled, label "Starting...",
   POST `/setup/openwa/start`.
2. On success → button re-enabled (or left "Polling…"), recursive
   `setTimeout` poll of `/setup/openwa/status` every ~3s starts.
   Status `<pre>` shows a friendly one-liner ("Waiting for QR…") plus the
   raw payload (kept but not re-written verbatim every tick if unchanged).
3. Poll sees `qr_ready` → stop polling, auto-GET `/setup/openwa/qr`,
   show `<img>`, status line "QR ready — scan with WhatsApp".
4. Poll sees `connected` → stop polling, status "Connected".
5. Poll sees `disconnected`/`created`/unknown → keep polling, update text.
6. Poll request fails → counter; after 3 consecutive failures stop and show
   the error; manual buttons still work.
7. Start request fails → stop, show error, re-enable button.
8. Manual **Load QR** and **Refresh status** stay available; manual Load QR
   keeps existing behavior (already starts session first after d89e006).
9. On page load, one status check: if already `qr_ready` → auto-load QR; if
   `connected` → just show status; otherwise idle (no polling until Start).
10. Double-click Start → guard flag ignores the second call; no concurrent
    poll loops.

Timings: poll every 3000ms; stop after ~20 polls (60s) with a "still not
ready — check OpenWA logs" message to avoid polling forever.

## Risks

- OpenWA session status values are passed through verbatim; if the gateway
  uses statuses other than the four seen (`created`, `qr_ready`, `connected`,
  `disconnected`), the poll must default to "keep polling" for unknown
  values rather than guessing wrong. A `session === null` short-circuit is
  required.
- Polling for a long time with no user action: needs a max-attempt cap so it
  stops and surfaces a message.
- QR can expire if the user is slow to scan; the manual "Load QR" button
  remains the recovery path (page already supports it).
- Embedded JS is untestable as-is; if we want automated coverage we must
  extract it (Approach 3), which slightly changes the page's delivery
  (module import vs inline).
- Docs (README/MESSAGE_FLOWS) describe the manual order; the README's
  "correct order" warning stays valid as a fallback but can be softened.

## Ready for Proposal

Yes. Frontend-only change to `src/network/http/routes/setup.ts` (HTML/JS
block). No backend or schema changes. The proposal phase should confirm:
(1) poll interval 3s and max ~20 polls are acceptable defaults, (2) whether
to extract JS for unit testing or keep inline, (3) whether "connected at
page load → no polling" is the desired behavior.
