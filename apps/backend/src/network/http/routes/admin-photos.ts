import { randomUUID } from 'node:crypto'
import { deleteQuery, personName } from '@doorcloud/shared'
import { getEnv } from 'config/env'
import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyReply,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault
} from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { DiskPhotoStorage, UNIDENTIFIED_FOLDER } from 'storage/photos'
import { validateImage } from 'utils'
import { z } from 'zod'
import { setupAuthMiddleware } from '../middleware/setup-auth'
import { response } from '../response'

type ZodFastifyInstance = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression<RawServerDefault>,
  RawReplyDefaultExpression<RawServerDefault>,
  FastifyBaseLogger,
  ZodTypeProvider
>

// D8: per-route multipart limits for bulk admin uploads (PA-5); the global
// 3/3 limits stay untouched for the existing routes.
const ADMIN_UPLOAD_LIMITS = {
  files: 20,
  fileSize: 20 * 1024 * 1024
}

const isNotFoundError = (error: unknown): boolean =>
  error instanceof Error &&
  'code' in error &&
  (error as { code?: unknown }).code === 'ENOENT'

const handleStorageError = (error: unknown, reply: FastifyReply): void => {
  if (error instanceof Error && error.message === 'Path escapes PHOTOS_DIR') {
    response({ error: true, message: error.message, reply, status: 400 })
    return
  }

  if (error instanceof Error && /reserved/i.test(error.message)) {
    response({ error: true, message: error.message, reply, status: 400 })
    return
  }

  if (isNotFoundError(error)) {
    response({ error: true, message: 'Not found', reply, status: 404 })
    return
  }

  throw error
}

// PA-2: shared personName only rejects path separators; the literal '.' and
// '..' names (and the reserved tray folder) are rejected here at the route
// layer so PA-2 passes end to end.
const personNameField = personName
  .refine(name => name !== '.' && name !== '..', {
    message: 'name cannot be "." or ".."'
  })
  .refine(name => name !== UNIDENTIFIED_FOLDER, {
    message: `name "${UNIDENTIFIED_FOLDER}" is reserved`
  })

const createPersonBody = z.object({ name: personNameField })
const renamePersonBody = z.object({ name: personNameField })
const promoteBodyField = z.object({ person: personNameField })

const personParams = z.object({ name: personNameField })
const photoParams = z.object({
  name: personNameField,
  filename: z
    .string()
    .trim()
    .min(1)
    .regex(/^[^/\\]+$/, 'filename must not contain path separators')
    .refine(f => f !== '.' && f !== '..', {
      message: 'filename cannot be "." or ".."'
    })
})
const trayPhotoParams = z.object({
  filename: z
    .string()
    .trim()
    .min(1)
    .regex(/^[^/\\]+$/, 'filename must not contain path separators')
    .refine(f => f !== '.' && f !== '..', {
      message: 'filename cannot be "." or ".."'
    })
})

const AdminPhotos = (server: ZodFastifyInstance): void => {
  const {
    PHOTOS_DIR,
    PHOTOS_BASE_URL,
    PHOTOS_URL_SECRET,
    PHOTO_URL_TTL_MS,
    USER_NAME
  } = getEnv()

  const photoStorage = new DiskPhotoStorage({
    photosDir: PHOTOS_DIR,
    baseUrl: PHOTOS_BASE_URL,
    urlSecret: PHOTOS_URL_SECRET,
    urlTtlMs: PHOTO_URL_TTL_MS
  })

  const auth = { preHandler: setupAuthMiddleware }

  // GET /admin/photos/persons - PA-4 list with photo counts + owner name
  server.get('/admin/photos/persons', auth, async (_request, reply) => {
    try {
      const personFolders = (await photoStorage.listDirectories()).sort()
      const persons = await Promise.all(
        personFolders.map(async name => ({
          name,
          photoCount: (await photoStorage.list(name)).length
        }))
      )

      // WF-7: the SPA needs USER_NAME to hide the owner's rename/delete
      return response({
        error: false,
        message: { owner: USER_NAME, persons },
        reply,
        status: 200
      })
    } catch (error) {
      handleStorageError(error, reply)
    }
  })

  // POST /admin/photos/persons - PA-2/PA-4 create folder
  server.post(
    '/admin/photos/persons',
    { ...auth, schema: { body: createPersonBody } },
    async (request, reply) => {
      const { name } = request.body

      try {
        // A-01: symmetric owner guard — the owner identity cannot be created
        // through the API even if the owner folder is absent.
        if (name === USER_NAME)
          return response({
            error: true,
            message: 'The owner folder cannot be created',
            reply,
            status: 403
          })

        if ((await photoStorage.listDirectories()).includes(name))
          return response({
            error: true,
            message: `Person "${name}" already exists`,
            reply,
            status: 409
          })

        await photoStorage.createFolder(name)

        return response({
          error: false,
          message: { name, photoCount: 0 },
          reply,
          status: 200
        })
      } catch (error) {
        handleStorageError(error, reply)
      }
    }
  )

  // PATCH /admin/photos/persons/:name - PA-3/PA-4 rename folder
  server.patch(
    '/admin/photos/persons/:name',
    { ...auth, schema: { body: renamePersonBody, params: personParams } },
    async (request, reply) => {
      const { name: from } = request.params
      const { name: to } = request.body

      if (from === USER_NAME)
        return response({
          error: true,
          message: 'The owner folder cannot be renamed',
          reply,
          status: 403
        })

      // A-01: symmetric owner guard — renaming any folder onto the owner
      // identity is rejected even when the owner folder is absent.
      if (to === USER_NAME)
        return response({
          error: true,
          message: 'The owner folder name is reserved',
          reply,
          status: 403
        })

      try {
        const persons = await photoStorage.listDirectories()

        if (!persons.includes(from))
          return response({
            error: true,
            message: 'Person not found',
            reply,
            status: 404
          })
        if (persons.includes(to))
          return response({
            error: true,
            message: `Person "${to}" already exists`,
            reply,
            status: 409
          })

        await photoStorage.renameFolder(from, to)

        return response({
          error: false,
          message: { name: to },
          reply,
          status: 200
        })
      } catch (error) {
        handleStorageError(error, reply)
      }
    }
  )

  // DELETE /admin/photos/persons/:name?confirm=true - PA-3/PA-4 hard delete
  server.delete(
    '/admin/photos/persons/:name',
    { ...auth, schema: { params: personParams, querystring: deleteQuery } },
    async (request, reply) => {
      const { name } = request.params

      if (!request.query.confirm)
        return response({
          error: true,
          message: 'confirm=true is required to delete a person',
          reply,
          status: 400
        })
      if (name === USER_NAME)
        return response({
          error: true,
          message: 'The owner folder cannot be deleted',
          reply,
          status: 403
        })

      try {
        if (!(await photoStorage.listDirectories()).includes(name))
          return response({
            error: true,
            message: 'Person not found',
            reply,
            status: 404
          })

        await photoStorage.deleteFolder(name)

        return response({
          error: false,
          message: { deleted: name },
          reply,
          status: 200
        })
      } catch (error) {
        handleStorageError(error, reply)
      }
    }
  )

  // GET /admin/photos/persons/:name/photos - PA-5 list with signed URLs
  server.get(
    '/admin/photos/persons/:name/photos',
    { ...auth, schema: { params: personParams } },
    async (request, reply) => {
      const { name } = request.params

      try {
        const photos = (await photoStorage.list(name)).map(filename => ({
          filename,
          url: photoStorage.getUrl(`${name}/${filename}`)
        }))

        return response({ error: false, message: photos, reply, status: 200 })
      } catch (error) {
        handleStorageError(error, reply)
      }
    }
  )

  // POST /admin/photos/persons/:name/photos - PA-5 multipart upload (D8)
  server.post(
    '/admin/photos/persons/:name/photos',
    { ...auth, schema: { params: personParams } },
    async (request, reply) => {
      const { name } = request.params
      const urls: string[] = []

      try {
        const parts = request.parts({ limits: ADMIN_UPLOAD_LIMITS })

        for await (const part of parts) {
          if (part.type !== 'file') continue

          const buffer = await part.toBuffer()

          // U-01: derive the stored extension from verified content
          const { ext } = validateImage(buffer, part.mimetype)
          const originalName = (part.filename || part.fieldname).trim()
          const baseName =
            originalName.replace(/\.[^./]+$/, '').replace(/[^\w.-]+/g, '-') ||
            'photo'
          const path = await photoStorage.upload(
            name,
            `${baseName}-${randomUUID()}.${ext}`,
            buffer
          )

          urls.push(photoStorage.getUrl(path))
        }

        return response({ error: false, message: urls, reply, status: 200 })
      } catch (error) {
        handleStorageError(error, reply)
      }
    }
  )

  // DELETE /admin/photos/persons/:name/photos/:filename - PA-5 single delete
  server.delete(
    '/admin/photos/persons/:name/photos/:filename',
    { ...auth, schema: { params: photoParams } },
    async (request, reply) => {
      const { name, filename } = request.params

      try {
        await photoStorage.deletePhoto(name, filename)

        return response({
          error: false,
          message: { deleted: filename },
          reply,
          status: 200
        })
      } catch (error) {
        handleStorageError(error, reply)
      }
    }
  )

  // GET /admin/photos/unidentified - PA-6 tray listing
  server.get('/admin/photos/unidentified', auth, async (_request, reply) => {
    try {
      const photos = (await photoStorage.listUnidentified()).map(filename => ({
        filename,
        url: photoStorage.getUrl(`${UNIDENTIFIED_FOLDER}/${filename}`)
      }))

      return response({ error: false, message: photos, reply, status: 200 })
    } catch (error) {
      handleStorageError(error, reply)
    }
  })

  // DELETE /admin/photos/unidentified/:filename - PA-6 tray delete
  server.delete(
    '/admin/photos/unidentified/:filename',
    { ...auth, schema: { params: trayPhotoParams } },
    async (request, reply) => {
      const { filename } = request.params

      try {
        await photoStorage.deletePhoto(UNIDENTIFIED_FOLDER, filename)

        return response({
          error: false,
          message: { deleted: filename },
          reply,
          status: 200
        })
      } catch (error) {
        handleStorageError(error, reply)
      }
    }
  )

  // POST /admin/photos/unidentified/:filename/promote - PA-6 MOVE (never copy)
  server.post(
    '/admin/photos/unidentified/:filename/promote',
    { ...auth, schema: { body: promoteBodyField, params: trayPhotoParams } },
    async (request, reply) => {
      const { filename } = request.params
      const { person } = request.body

      try {
        if (!(await photoStorage.listDirectories()).includes(person))
          return response({
            error: true,
            message: `Person "${person}" not found`,
            reply,
            status: 404
          })

        const path = await photoStorage.movePhoto(
          UNIDENTIFIED_FOLDER,
          filename,
          person
        )

        return response({
          error: false,
          message: { url: photoStorage.getUrl(path) },
          reply,
          status: 200
        })
      } catch (error) {
        handleStorageError(error, reply)
      }
    }
  )
}

export { AdminPhotos }
