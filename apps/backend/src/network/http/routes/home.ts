import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault
} from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { response } from 'network/http/response'

type ZodFastifyInstance = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression<RawServerDefault>,
  RawReplyDefaultExpression<RawServerDefault>,
  FastifyBaseLogger,
  ZodTypeProvider
>

const Home = (app: ZodFastifyInstance, prefix = '/'): void => {
  app.get(`${prefix}`, (_request, reply) => {
    response({
      error: false,
      message: 'DoorCloud backend!',
      reply,
      status: 200
    })
  })
}

export { Home }
