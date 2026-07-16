import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault
} from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { uploadUserPhotoParamsSchema, userSchema } from 'schemas'
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
    url: `${prefix}/user`,
    schema: {
      body: userSchema
    },
    handler: async (request, reply) => {
      const {
        body: { name, phone }
      } = request

      try {
        const result = await us.createUser(name, phone)

        return response({ error: false, message: result, reply, status: 200 })
      } catch (error) {
        handlerErrorInRoute(error)
      }
    }
  })

  server.route({
    method: 'POST',
    url: `${prefix}/user/:folderID/upload`,
    schema: {
      params: uploadUserPhotoParamsSchema
    },
    handler: async (request, reply) => {
      const {
        params: { folderID }
      } = request

      if (!folderID)
        return response({
          error: true,
          message: 'folderID is required',
          reply,
          status: 400
        })

      try {
        const result = await us.uploadPhotos(folderID, await request.files())

        return response({ error: false, message: result, reply, status: 200 })
      } catch (error) {
        handlerErrorInRoute(error)
      }
    }
  })
}

export { User }
