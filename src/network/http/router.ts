import type {
  FastifyBaseLogger,
  FastifyError,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault
} from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { response } from './response'
import { Home, Setup, User } from './routes'

const routes = [Home, Setup, User]
type ZodFastifyInstance = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression<RawServerDefault>,
  RawReplyDefaultExpression<RawServerDefault>,
  FastifyBaseLogger,
  ZodTypeProvider
>

const applyRoutes = (app: ZodFastifyInstance): void => {
  routes.forEach(route => route(app))

  // Handling 404 error
  app.setNotFoundHandler((request, reply) => {
    response({
      error: true,
      message: 'This route does not exists',
      reply,
      status: 404
    })
  })
  app.setErrorHandler(
    (error: FastifyError & { status?: number }, request, reply) => {
      const status = error.statusCode ?? error.status ?? 500

      response({
        error: true,
        message: error.message,
        reply,
        status
      })
    }
  )
}

export { applyRoutes }
