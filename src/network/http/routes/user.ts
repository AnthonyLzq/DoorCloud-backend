import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { BusboyConfig } from '@fastify/busboy'
import { MultipartFile } from '@fastify/multipart'
import httpErrors from 'http-errors'

import { UserServices } from 'services'
import { userRef, UserRequest } from 'schemas'
import { response } from '../response'

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
        const message = error instanceof Error ? error.message : ''

        throw new httpErrors.InternalServerError(
          `Something went wrong: ${message}`
        )
      }
    }
  })

  server.route({
    method: 'POST',
    url: `${prefix}/user/:idFolder/upload`,
    handler: async (
      request: FastifyRequest<{ Params: { idFolder: string } }>,
      reply: FastifyReply
    ) => {
      const {
        params: { idFolder }
      } = request

      if (!idFolder)
        return response({
          error: true,
          message: 'idFolder is required',
          reply,
          status: 400
        })

      try {
        const result = await us.uploadPhotos(idFolder, await request.files())

        return response({ error: false, message: result, reply, status: 200 })
      } catch (error) {
        const message = error instanceof Error ? error.message : ''

        throw new httpErrors.InternalServerError(
          `Something went wrong: ${message}`
        )
      }
    }
  })
}

export { User }
