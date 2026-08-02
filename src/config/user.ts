import { getEnv } from 'config/env'

type ActiveUser = {
  readonly id: string
  readonly name: string
  readonly phone: string
}

const getActiveUser = (): ActiveUser => {
  const { USER_ID, USER_NAME, USER_PHONE } = getEnv()

  return Object.freeze({ id: USER_ID, name: USER_NAME, phone: USER_PHONE })
}

export type { ActiveUser }
export { getActiveUser }
