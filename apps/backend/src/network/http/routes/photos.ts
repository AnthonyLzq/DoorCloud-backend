import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
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

// U-04a: header values reject control chars and non-ASCII; a person folder
// name may legally contain CR/LF/quotes or accented characters (e.g.
// "Nicolás\r\nR-Ro-<uuid>.jpg"), which would make setHeader throw
// ERR_INVALID_CHAR and turn the response into a 500. Keep the plain
// filename RFC 6266-safe (ASCII fallback) and carry the real name in an
// RFC 5987 filename* (percent-encoded).
const headerContentDisposition = (fullPath: string): string => {
  const name = basename(fullPath)
  const fallback = Array.from(name)
    .map(c => {
      const code = c.charCodeAt(0)
      if (
        code < 0x20 ||
        code === 0x7f ||
        code > 0x7e ||
        c === '"' ||
        c === '\\'
      )
        return '_'
      return c
    })
    .join('')
  const encoded = encodeURIComponent(name).replace(
    /[!'()*]/g,
    c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  )

  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

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

    // U-04: explicit Content-Disposition (defense-in-depth) so browsers treat
    // the payload as the intended image file rather than guessing content type.
    // U-04a: the filename is sanitized so control/non-ASCII characters in a
    // person folder name can never inject header values or break the response.
    return reply
      .type(contentTypeFor(fullPath))
      .header('Content-Disposition', headerContentDisposition(fullPath))
      .send(createReadStream(fullPath))
  })
}

export type { ZodFastifyInstance }
export { Photos }
