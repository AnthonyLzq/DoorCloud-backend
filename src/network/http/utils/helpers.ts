import createError from 'http-errors'
import { CustomError } from './customError'

const handlerErrorInRoute = (error: unknown) => {
  let message = ''
  let code = 500

  if (error instanceof CustomError) {
    message = error.message
    code = error.code
  }

  throw createError(code, message)
}

export { handlerErrorInRoute }
