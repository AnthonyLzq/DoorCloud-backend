import createError from 'http-errors'
import { CustomError } from './customError'

const handlerErrorInRoute = (error: unknown) => {
  let message = ''
  let code = 500

  if (error instanceof CustomError) {
    message = error.message
    code = error.code
  } else if (error instanceof Error && 'code' in error) {
    const errCode = (error as { code?: unknown }).code

    // U-02/U-03: multipart/official Fastify body errors map to client errors
    // instead of 500. A file over the per-route limit is 413; a missing or
    // malformed multipart content type is 400.
    if (errCode === 'FST_REQ_FILE_TOO_LARGE') {
      message = 'File too large'
      code = 413
    } else if (
      errCode === 'FST_INVALID_MULTIPART_CONTENT_TYPE' ||
      errCode === 'FST_ERR_CTP_INVALID_MEDIA_TYPE'
    ) {
      message = 'Invalid or empty multipart body'
      code = 400
    } else if (typeof errCode === 'number') {
      // U-01: content validation errors carry a numeric HTTP status (e.g. 415)
      message = error.message
      code = errCode
    }
  }

  throw createError(code, message)
}

export { handlerErrorInRoute }
