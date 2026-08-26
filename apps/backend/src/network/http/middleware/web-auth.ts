import { getEnv } from 'config/env'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { safeEqual } from './auth'

const REALM = 'DoorCloud'

// Exempt paths: container liveness, signed photo URLs consumed by
// OpenWA/WhatsApp, and the Bearer-governed admin/setup API surfaces. These
// are authorized by their route-level setupAuthMiddleware (Bearer), which
// runs after this global preHandler, so exempting them lets Bearer win
// without the Basic layer rejecting the same authorization header.
// Everything else requires Basic credentials.
const isExemptPath = (path: string): boolean =>
  path.startsWith('/healthz') ||
  path.startsWith('/photos') ||
  path.startsWith('/admin') ||
  path.startsWith('/setup')

const reject = (reply: FastifyReply): void => {
  reply
    .header('WWW-Authenticate', `Basic realm="${REALM}"`)
    .code(401)
    .send({ error: true, message: 'Authentication required' })
}

/**
 * HTTP Basic Auth middleware for the web surfaces (SPA and assets).
 * If WEB_AUTH_USER or WEB_AUTH_PASS are not configured, access is allowed
 * (for local development), matching setupAuthMiddleware with SETUP_TOKEN.
 */
export const webAuthMiddleware = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const { WEB_AUTH_USER, WEB_AUTH_PASS } = getEnv()

  // If no credentials are configured, allow access (local development)
  if (!WEB_AUTH_USER || !WEB_AUTH_PASS) return

  if (isExemptPath(request.url)) return

  const authHeader = request.headers.authorization

  if (!authHeader?.startsWith('Basic ')) {
    reject(reply)
    return
  }

  let decoded = ''
  try {
    decoded = Buffer.from(authHeader.substring(6), 'base64').toString('utf8')
  } catch {
    reject(reply)
    return
  }

  const separator = decoded.indexOf(':')
  if (separator === -1) {
    reject(reply)
    return
  }

  const user = decoded.substring(0, separator)
  const password = decoded.substring(separator + 1)

  if (!safeEqual(WEB_AUTH_USER, user) || !safeEqual(WEB_AUTH_PASS, password)) {
    reject(reply)
    return
  }
}
