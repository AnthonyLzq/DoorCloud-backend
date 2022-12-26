import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { BusboyConfig } from '@fastify/busboy'
import { MultipartFile } from '@fastify/multipart'

import { userRef, UserRequest } from 'schemas'
import { UserServices } from 'services'
import { response } from '../response'
import { handlerErrorInRoute } from '../utils'

declare module 'fastify' {
  interface FastifyRequest {
    files: (
      options?: Omit<BusboyConfig, 'headers'>
    ) => AsyncIterableIterator<MultipartFile>
  }
}

const User = (server: FastifyInstance, prefix = '/api') => {
  const us = new UserServices(server.log)

  server.route({
    method: 'POST',
    url: `${prefix}/user`,
    schema: {
      body: userRef('userSchema')
    },
    handler: async (
      request: FastifyRequest<{ Body: UserRequest }>,
      reply: FastifyReply
    ) => {
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
    handler: async (
      request: FastifyRequest<{ Params: { folderID: string } }>,
      reply: FastifyReply
    ) => {
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
