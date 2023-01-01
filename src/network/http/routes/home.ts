import { FastifyInstance } from 'fastify'

import { response } from 'network/http/response'

const Home = (app: FastifyInstance, prefix = '/'): void => {
  app.get(`${prefix}`, (request, reply) => {
    response({
      error: false,
      message: 'DoorCloud backend!',
      reply,
      status: 900
    })
  })
}

export { Home }
