import type { FastifyRequest, FastifyReply } from 'fastify'
import { getEnv } from 'config/env'

/**
 * Middleware para autenticar endpoints de setup
 * Valida el header Authorization: Bearer <SETUP_TOKEN>
 * Si SETUP_TOKEN no está configurado, permite el acceso (para desarrollo local)
 */
export const setupAuthMiddleware = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const { SETUP_TOKEN } = getEnv()

  // Si no hay SETUP_TOKEN configurado, permitir acceso (desarrollo local)
  if (!SETUP_TOKEN) {
    return
  }

  const authHeader = request.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({
      error: true,
      message: 'Authorization header with Bearer token required'
    })
    return
  }

  const token = authHeader.substring(7) // Remove 'Bearer ' prefix

  if (token !== SETUP_TOKEN) {
    reply.code(403).send({
      error: true,
      message: 'Invalid setup token'
    })
    return
  }
}
