import { getEnv } from 'config/env'
import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * Middleware to authenticate setup endpoints
 * Validates the Authorization header: Bearer <SETUP_TOKEN>
 * If SETUP_TOKEN is not configured, access is allowed (local development)
 */
export const setupAuthMiddleware = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const { SETUP_TOKEN } = getEnv()

  // If SETUP_TOKEN is not configured, allow access (local development)
  if (!SETUP_TOKEN) {
    return
  }

  const authHeader = request.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
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
