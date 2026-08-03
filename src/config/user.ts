import { getEnv } from 'config/env'

type ActiveUser = {
  readonly name: string
  readonly phone: string
}

const getActiveUser = (): ActiveUser => {
  const { USER_NAME, USER_PHONE } = getEnv()

  return Object.freeze({ name: USER_NAME, phone: USER_PHONE })
}

export type { ActiveUser }
export { getActiveUser }
