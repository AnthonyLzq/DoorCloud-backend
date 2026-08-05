import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  createApiFetch,
  createLocalStorageTokenStore,
  SETUP_TOKEN_KEY
} from '../src/auth'

afterEach(() => {
  vi.unstubAllGlobals()
})

const makeHarness = () => {
  const fetchImpl = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
      new Response(null, { status: 200 })
  )
  const prompt = vi.fn()
  const memory = new Map<string, string>()
  const tokenStore = {
    get: () => memory.get(SETUP_TOKEN_KEY) ?? null,
    set: (token: string) => {
      memory.set(SETUP_TOKEN_KEY, token)
    },
    clear: () => {
      memory.delete(SETUP_TOKEN_KEY)
    }
  }

  return { fetchImpl, prompt, tokenStore, memory }
}

describe('createApiFetch (WF-2)', () => {
  test('attaches the stored token as a Bearer header', async () => {
    const { fetchImpl, prompt, tokenStore } = makeHarness()
    tokenStore.set('secret-token')
    const apiFetch = createApiFetch({ fetch: fetchImpl, prompt, tokenStore })

    const response = await apiFetch('/setup/openwa/status')

    expect(response.status).toBe(200)
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer secret-token')
  })

  test('sends no Authorization header when no token is stored', async () => {
    const { fetchImpl, prompt, tokenStore } = makeHarness()
    const apiFetch = createApiFetch({ fetch: fetchImpl, prompt, tokenStore })

    await apiFetch('/admin/photos/persons')

    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Headers
    expect(headers.get('Authorization')).toBeNull()
  })

  test('401 without a token prompts, stores the entered token, and retries', async () => {
    const { fetchImpl, prompt, tokenStore } = makeHarness()
    fetchImpl
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    prompt.mockReturnValue('entered-token')
    const apiFetch = createApiFetch({ fetch: fetchImpl, prompt, tokenStore })

    const response = await apiFetch('/setup/openwa/status')

    expect(response.status).toBe(200)
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(tokenStore.get()).toBe('entered-token')
    const retryHeaders = fetchImpl.mock.calls[1]?.[1]?.headers as Headers
    expect(retryHeaders.get('Authorization')).toBe('Bearer entered-token')
  })

  test('401 with a stored token clears it before prompting', async () => {
    const { fetchImpl, prompt, tokenStore } = makeHarness()
    tokenStore.set('stale-token')
    fetchImpl.mockResolvedValue(new Response(null, { status: 401 }))
    prompt.mockReturnValue(null)
    const apiFetch = createApiFetch({ fetch: fetchImpl, prompt, tokenStore })

    const response = await apiFetch('/setup/openwa/status')

    expect(response.status).toBe(401)
    expect(tokenStore.get()).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  test('a cancelled prompt returns the 401 response without retrying', async () => {
    const { fetchImpl, prompt, tokenStore } = makeHarness()
    fetchImpl.mockResolvedValue(new Response(null, { status: 401 }))
    prompt.mockReturnValue(null)
    const apiFetch = createApiFetch({ fetch: fetchImpl, prompt, tokenStore })

    const response = await apiFetch('/admin/photos/persons')

    expect(response.status).toBe(401)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('createLocalStorageTokenStore', () => {
  test('round-trips a token through localStorage', () => {
    const backing = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => {
        backing.set(key, value)
      },
      removeItem: (key: string) => {
        backing.delete(key)
      }
    })
    const store = createLocalStorageTokenStore()

    expect(store.get()).toBeNull()
    store.set('round-trip-token')
    expect(store.get()).toBe('round-trip-token')
    store.clear()
    expect(store.get()).toBeNull()
  })
})
