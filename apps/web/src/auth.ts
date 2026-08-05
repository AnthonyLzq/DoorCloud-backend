// WF-2: the SPA reads SETUP_TOKEN from localStorage and sends it as a Bearer
// header on every setup/admin request. A 401 (missing or rejected token)
// clears the stored token and prompts for a fresh one, retrying once.

export const SETUP_TOKEN_KEY = 'doorcloud.setupToken'

export type TokenStore = {
  get: () => string | null
  set: (token: string) => void
  clear: () => void
}

export type ApiFetchDeps = {
  fetch: typeof fetch
  prompt: (message: string) => string | null
  tokenStore: TokenStore
}

export type ApiFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

export const createLocalStorageTokenStore = (): TokenStore => ({
  get: () => localStorage.getItem(SETUP_TOKEN_KEY),
  set: token => {
    localStorage.setItem(SETUP_TOKEN_KEY, token)
  },
  clear: () => {
    localStorage.removeItem(SETUP_TOKEN_KEY)
  }
})

export const createApiFetch = ({
  fetch: fetchImpl,
  prompt,
  tokenStore
}: ApiFetchDeps): ApiFetch => {
  const attempt = async (
    input: RequestInfo | URL,
    init: RequestInit
  ): Promise<Response> => {
    const token = tokenStore.get()
    const headers = new Headers(init.headers)

    if (token) headers.set('Authorization', `Bearer ${token}`)

    return fetchImpl(input, { ...init, headers })
  }

  return async (input, init = {}) => {
    const response = await attempt(input, init)

    if (response.status !== 401) return response

    // A 401 with a stored token means the token was rejected: drop it
    // before asking for a replacement so the next prompt starts clean.
    tokenStore.clear()
    const entered = prompt('Enter the DoorCloud SETUP_TOKEN')

    if (!entered || !entered.trim()) return response

    tokenStore.set(entered.trim())

    return attempt(input, init)
  }
}
