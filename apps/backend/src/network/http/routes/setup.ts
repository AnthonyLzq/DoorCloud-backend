import { openWaSetupConfigSchema } from '@doorcloud/shared'
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
import { setupAuthMiddleware } from '../middleware/setup-auth'
import { response } from '../response'

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

const Setup = (server: ZodFastifyInstance): void => {
  // GET /setup (HTML) is served by the SPA (see server.ts D7) — the API
  // handlers below are the backend half of the setup flow.

  // GET /setup/openwa/status - Requiere autenticación
  server.get(
    '/setup/openwa/status',
    { preHandler: setupAuthMiddleware },
    async (_request, reply) => {
      try {
        const result = await getOpenWaSetupStatus(server.log)

        return response({ error: false, message: result, reply, status: 200 })
      } catch (error) {
        server.log.error({ err: error }, 'OpenWA setup status failed')

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
        body: openWaSetupConfigSchema
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
        server.log.error({ err: error }, 'OpenWA setup start failed')

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
        server.log.error({ err: error }, 'OpenWA setup QR failed')

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
        server.log.error({ err: error }, 'OpenWA setup send-test failed')

        throw error
      }
    }
  )
}

export { Setup }
