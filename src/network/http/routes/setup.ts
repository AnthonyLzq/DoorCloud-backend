import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault
} from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import {
  getOpenWaSetupQr,
  getOpenWaSetupStatus,
  saveOpenWaSetupConfig,
  sendOpenWaSetupTest,
  startOpenWaSetupSession
} from 'integrations'
import { z } from 'zod'
import { response } from '../response'
import { setupAuthMiddleware } from '../middleware/setup-auth'

type ZodFastifyInstance = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression<RawServerDefault>,
  RawReplyDefaultExpression<RawServerDefault>,
  FastifyBaseLogger,
  ZodTypeProvider
>

const setupTestSchema = z.object({
  imageUrl: z.string().url().optional(),
  text: z.string().trim().min(1).optional()
})

const setupConfigSchema = z.object({
  OPENWA_API_KEY: z.string().trim().min(1).optional(),
  OPENWA_BASE_URL: z.string().trim().url().optional(),
  OPENWA_CHAT_ID: z.string().trim().min(1).optional(),
  OPENWA_SESSION_ID: z.string().trim().min(1).optional()
})

const renderSetupHtml = (): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>DoorCloud OpenWA setup</title>
    <style>
      body { color: #17202a; font-family: system-ui, sans-serif; margin: 2rem; }
      button, input { border: 1px solid #bcc7d1; border-radius: .4rem; font: inherit; padding: .6rem .8rem; }
      button { background: #0b5fff; color: white; cursor: pointer; margin: .25rem .25rem .25rem 0; }
      input { min-width: min(32rem, 100%); }
      pre { background: #f5f7fa; border-radius: .4rem; overflow: auto; padding: 1rem; }
      .card { border: 1px solid #d8dee9; border-radius: .75rem; margin: 1rem 0; max-width: 48rem; padding: 1rem; }
      #qr { border: 1px solid #d8dee9; display: none; max-width: 320px; padding: .5rem; width: 100%; }
    </style>
  </head>
  <body>
    <h1>DoorCloud OpenWA setup</h1>
    <p>Start the configured OpenWA session, load the QR, scan it with WhatsApp, then send a test message.</p>
    <div class="card">
      <label for="openwa-chat-id">Destination WhatsApp chat ID</label><br />
      <input id="openwa-chat-id" type="text" placeholder="51999999999@c.us" /><br /><br />
      <button id="save-config">Save destination</button>
      <hr />
      <button id="refresh">Refresh status</button>
      <button id="start">Start session</button>
      <button id="qr-button">Load QR</button>
      <pre id="status">Loading...</pre>
      <img id="qr" alt="OpenWA sign-in QR" />
    </div>
    <div class="card">
      <label for="image-url">Optional public image URL for send-image test</label><br />
      <input id="image-url" type="url" placeholder="https://example.com/image.jpg" />
      <button id="send-test">Send test</button>
    </div>
    <script>
      const statusEl = document.getElementById('status')
      const qrEl = document.getElementById('qr')
      const imageUrlEl = document.getElementById('image-url')
      const openWaChatIdEl = document.getElementById('openwa-chat-id')

      const request = async (path, options = {}) => {
        const response = await fetch(path, {
          headers: {
            'Content-Type': 'application/json'
          },
          ...options
        })
        const text = await response.text()
        let data = {}

        try {
          data = text ? JSON.parse(text) : {}
        } catch {
          data = {}
        }

        if (!response.ok || data.error) {
          throw new Error(data.message ?? text ?? response.statusText)
        }

        return data.message
      }

      const applyStatusToForm = data => {
        if (!data || typeof data !== 'object') return
        if (data.configuredChatId) openWaChatIdEl.value = data.configuredChatId
      }

      const showStatus = data => {
        applyStatusToForm(data)
        statusEl.textContent = JSON.stringify(data, null, 2)
      }

      const refreshStatus = async () => {
        showStatus(await request('/setup/openwa/status'))
      }

      document.getElementById('refresh').onclick = refreshStatus
      document.getElementById('save-config').onclick = async () => {
        const body = {
          ...(openWaChatIdEl.value.trim() ? { OPENWA_CHAT_ID: openWaChatIdEl.value.trim() } : {})
        }

        showStatus(await request('/setup/config', {
          body: JSON.stringify(body),
          method: 'POST'
        }))
      }
      document.getElementById('start').onclick = async () => {
        showStatus(await request('/setup/openwa/start', { method: 'POST' }))
      }
      document.getElementById('qr-button').onclick = async () => {
        const result = await request('/setup/openwa/qr')
        qrEl.src = result.qrCode
        qrEl.style.display = 'block'
        showStatus({ status: result.status ?? 'qr_ready' })
      }
      document.getElementById('send-test').onclick = async () => {
        const imageUrl = imageUrlEl.value.trim()
        showStatus(await request('/setup/openwa/send-test', {
          body: JSON.stringify(imageUrl ? { imageUrl } : {}),
          method: 'POST'
        }))
      }

      refreshStatus().catch(error => {
        statusEl.textContent = error.message
      })
    </script>
  </body>
</html>`

const Setup = (server: ZodFastifyInstance): void => {
  // GET /setup - Página de setup (no requiere autenticación)
  server.get('/setup', (_request, reply) => {
    reply.type('text/html').send(renderSetupHtml())
  })

  // GET /setup/openwa/status - Requiere autenticación
  server.get(
    '/setup/openwa/status',
    { preHandler: setupAuthMiddleware },
    async (_request, reply) => {
      try {
        const result = await getOpenWaSetupStatus(server.log)

        return response({ error: false, message: result, reply, status: 200 })
      } catch (error) {
        server.log.error({ error }, 'OpenWA setup status failed')

        throw error
      }
    }
  )

  // POST /setup/config - Requiere autenticación
  server.post(
    '/setup/config',
    {
      preHandler: setupAuthMiddleware,
      schema: {
        body: setupConfigSchema
      }
    },
    async (request, reply) => {
      const result = saveOpenWaSetupConfig(request.body)

      return response({ error: false, message: result, reply, status: 200 })
    }
  )

  // POST /setup/openwa/start - Requiere autenticación
  server.post(
    '/setup/openwa/start',
    { preHandler: setupAuthMiddleware },
    async (_request, reply) => {
      try {
        const result = await startOpenWaSetupSession(server.log)

        return response({ error: false, message: result, reply, status: 200 })
      } catch (error) {
        server.log.error({ error }, 'OpenWA setup start failed')

        throw error
      }
    }
  )

  // GET /setup/openwa/qr - Requiere autenticación
  server.get(
    '/setup/openwa/qr',
    { preHandler: setupAuthMiddleware },
    async (_request, reply) => {
      try {
        const result = await getOpenWaSetupQr(server.log)

        return response({ error: false, message: result, reply, status: 200 })
      } catch (error) {
        server.log.error({ error }, 'OpenWA setup QR failed')

        throw error
      }
    }
  )

  // POST /setup/openwa/send-test - Requiere autenticación
  server.post(
    '/setup/openwa/send-test',
    {
      preHandler: setupAuthMiddleware,
      schema: {
        body: setupTestSchema
      }
    },
    async (request, reply) => {
      try {
        const result = await sendOpenWaSetupTest({
          imageUrl: request.body.imageUrl,
          log: server.log,
          text: request.body.text
        })

        return response({ error: false, message: result, reply, status: 200 })
      } catch (error) {
        server.log.error({ error }, 'OpenWA setup send-test failed')

        throw error
      }
    }
  )
}

export { renderSetupHtml, Setup }
