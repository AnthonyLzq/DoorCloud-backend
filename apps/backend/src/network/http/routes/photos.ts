import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { getEnv } from 'config/env'
import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault
} from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { DiskPhotoStorage } from 'storage/photos'

type ZodFastifyInstance = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression<RawServerDefault>,
  RawReplyDefaultExpression<RawServerDefault>,
  FastifyBaseLogger,
  ZodTypeProvider
>

const PHOTO_CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

const contentTypeFor = (path: string): string =>
  PHOTO_CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream'

const isNotFoundError = (error: unknown): boolean =>
  error instanceof Error &&
  'code' in error &&
  (error as { code?: unknown }).code === 'ENOENT'

/**
 * Serves signed photo URLs under /photos/:signature/:expiresAt/*.
 *
 * The URL is HMAC-signed (see DiskPhotoStorage.getUrl) and time-limited;
 * the handler validates the signature and expires timestamp, then resolves
 * the requested path with the containment check before streaming the file.
 * No authentication beyond the signature is required (OpenWA/WhatsApp fetch
 * these URLs to attach door photos to messages).
 */
const Photos = (server: ZodFastifyInstance): void => {
  const { PHOTOS_DIR, PHOTOS_BASE_URL, PHOTOS_URL_SECRET, PHOTO_URL_TTL_MS } =
    getEnv()

  const photoStorage = new DiskPhotoStorage({
    photosDir: PHOTOS_DIR,
    baseUrl: PHOTOS_BASE_URL,
    urlSecret: PHOTOS_URL_SECRET,
    urlTtlMs: PHOTO_URL_TTL_MS
  })

  server.get<{
    Params: { signature: string; expiresAt: string; '*': string }
  }>('/photos/:signature/:expiresAt/*', async (request, reply) => {
    const { signature, expiresAt } = request.params
    const path = request.params['*']
    const expiresAtNumber = Number(expiresAt)

    if (!Number.isFinite(expiresAtNumber))
      return reply.code(400).send({ error: 'Invalid path' })

    if (!photoStorage.isUrlValid(path, signature, expiresAtNumber))
      return reply.code(404).send({ error: 'Not found' })

    let fullPath: string
    try {
      // Centralized containment check (rejects traversal and absolute paths)
      fullPath = photoStorage.resolvePath(path)
    } catch {
      return reply.code(400).send({ error: 'Invalid path' })
    }

    try {
      // Map missing files and directories to 404 instead of a stream 500
      const file = await stat(fullPath)
      if (!file.isFile()) return reply.code(404).send({ error: 'Not found' })
    } catch (error) {
      if (isNotFoundError(error))
        return reply.code(404).send({ error: 'Not found' })

      throw error
    }

    return reply.type(contentTypeFor(fullPath)).send(createReadStream(fullPath))
  })
}

export type { ZodFastifyInstance }
export { Photos }
