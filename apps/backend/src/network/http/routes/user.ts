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

// U-02: explicit single-file + size limit on the Basic-only write primitive.
// The global multipart registration (server.ts) has no fileSize, so the user
// upload gets its own bounded limits; the generated 413/400 are mapped in
// handlerErrorInRoute.
const USER_UPLOAD_LIMITS = { files: 1, fileSize: 10 * 1024 * 1024 }

const User = (server: ZodFastifyInstance, prefix = '/api') => {
  const us = new UserServices(server.log)

  server.route({
    method: 'POST',
    url: `${prefix}/user/upload`,
    handler: async (request, reply) => {
      try {
        const parts = request.parts({ limits: USER_UPLOAD_LIMITS })
        const result = await us.uploadPhotos(parts)

        return response({ error: false, message: result, reply, status: 200 })
      } catch (error) {
        handlerErrorInRoute(error)
      }
    }
  })
}

export { User }
