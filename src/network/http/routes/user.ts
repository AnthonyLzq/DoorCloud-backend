import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault
} from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { UserServices } from 'services'
import { response } from '../response'
import { handlerErrorInRoute } from '../utils'

type ZodFastifyInstance = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression<RawServerDefault>,
  RawReplyDefaultExpression<RawServerDefault>,
  FastifyBaseLogger,
  ZodTypeProvider
>

const User = (server: ZodFastifyInstance, prefix = '/api') => {
  const us = new UserServices(server.log)

  server.route({
    method: 'POST',
    url: `${prefix}/user/upload`,
    handler: async (request, reply) => {
      try {
        const result = await us.uploadPhotos(await request.files())

        return response({ error: false, message: result, reply, status: 200 })
      } catch (error) {
        handlerErrorInRoute(error)
      }
    }
  })
}

export { User }
