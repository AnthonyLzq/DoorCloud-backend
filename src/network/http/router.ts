import { FastifyInstance } from 'fastify'
import { HttpError } from 'http-errors'

import { response } from './response'
import { Home, User } from './routes'

const routes = [Home, User]
const applyRoutes = (app: FastifyInstance): void => {
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
  app.setErrorHandler<HttpError>((error, request, reply) => {
    response({
      error: true,
      message: error.message,
      reply,
      status: error.status ?? 500
    })
  })
}

export { applyRoutes }
