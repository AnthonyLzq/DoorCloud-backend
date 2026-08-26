import createError from 'http-errors'
import { CustomError } from './customError'

const handlerErrorInRoute = (error: unknown) => {
  let message = ''
  let code = 500

  if (error instanceof CustomError) {
    message = error.message
    code = error.code
  } else if (error instanceof Error) {
    const errCode = (error as { code?: unknown }).code

    // U-02/U-03: multipart/official Fastify body errors map to client errors
    // instead of 500. A file over the per-route limit or more files than the
    // route allows is 413; a missing/malformed multipart content type, too
    // many form parts/fields, or a truncated/empty multipart body is 400.
    if (errCode === 'FST_REQ_FILE_TOO_LARGE' || errCode === 'FST_FILES_LIMIT') {
      message =
        errCode === 'FST_FILES_LIMIT' ? 'Too many files' : 'File too large'
      code = 413
    } else if (
      errCode === 'FST_INVALID_MULTIPART_CONTENT_TYPE' ||
      errCode === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' ||
      errCode === 'FST_PARTS_LIMIT' ||
      errCode === 'FST_FIELDS_LIMIT' ||
      errCode === 'FST_NO_FORM_DATA'
    ) {
      message = 'Invalid or empty multipart body'
      code = 400
    } else if (
      errCode === undefined &&
      error.message === 'Unexpected end of multipart data'
    ) {
      // busboy reports a truncated/mismatched multipart body as a plain
      // Error without a code (e.g. client boundary mismatch)
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
