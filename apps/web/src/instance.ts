import { type Api, createApi } from './api'
import { createApiFetch, createLocalStorageTokenStore } from './auth'

// D6: one shared API instance wired to the real token store and prompt.
// Own module so views can import it without creating an App -> view cycle.
export const apiFetch = createApiFetch({
  fetch: globalThis.fetch.bind(globalThis),
  prompt: (message: string) => globalThis.prompt(message),
  tokenStore: createLocalStorageTokenStore()
})

export const api: Api = createApi(apiFetch)
