import type {
  OpenWaQr,
  OpenWaSetupConfig,
  OpenWaSetupConfigResult,
  OpenWaSetupStatus,
  PersonItem,
  PhotoItem
} from '@doorcloud/shared'
import type { ApiFetch } from './auth'

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

// PA-1: every setup/admin response uses the { error, message } envelope.
interface Envelope {
  error?: boolean
  message?: unknown
}

const unwrap = async <T>(responsePromise: Promise<Response>): Promise<T> => {
  const response = await responsePromise
  const envelope = (await response.json().catch(() => null)) as Envelope | null

  if (!response.ok || envelope?.error) {
    const message =
      typeof envelope?.message === 'string'
        ? envelope.message
        : `Request failed (${response.status})`

    throw new ApiError(message, response.status)
  }

  return envelope?.message as T
}

export interface PersonsResponse {
  owner: string
  persons: PersonItem[]
}

export type Api = ReturnType<typeof createApi>

export const createApi = (fetchImpl: ApiFetch) => ({
  // OpenWA setup (WF-1..6)
  getSetupStatus: () =>
    unwrap<OpenWaSetupStatus>(fetchImpl('/setup/openwa/status')),
  startSetupSession: () =>
    unwrap<OpenWaSetupStatus>(
      fetchImpl('/setup/openwa/start', { method: 'POST' })
    ),
  getSetupQr: () => unwrap<OpenWaQr>(fetchImpl('/setup/openwa/qr')),
  saveSetupConfig: (config: OpenWaSetupConfig) =>
    unwrap<OpenWaSetupConfigResult>(
      fetchImpl('/setup/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })
    ),
  sendSetupTest: (body: { imageUrl?: string; text?: string }) =>
    unwrap(
      fetchImpl('/setup/openwa/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    ),

  // Persons CRUD (WF-7, PA-4)
  listPersons: () =>
    unwrap<PersonsResponse>(fetchImpl('/admin/photos/persons')),
  createPerson: (name: string) =>
    unwrap<PersonItem>(
      fetchImpl('/admin/photos/persons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      })
    ),
  renamePerson: (from: string, to: string) =>
    unwrap(
      fetchImpl(`/admin/photos/persons/${encodeURIComponent(from)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: to })
      })
    ),
  deletePerson: (name: string) =>
    unwrap(
      fetchImpl(
        `/admin/photos/persons/${encodeURIComponent(name)}?confirm=true`,
        { method: 'DELETE' }
      )
    ),

  // Photos per person (WF-8, PA-5)
  listPhotos: (person: string) =>
    unwrap<PhotoItem[]>(
      fetchImpl(`/admin/photos/persons/${encodeURIComponent(person)}/photos`)
    ),
  uploadPhoto: (person: string, file: Blob, filename: string) => {
    const form = new FormData()

    form.append('photo', file, filename)

    return unwrap<string[]>(
      fetchImpl(`/admin/photos/persons/${encodeURIComponent(person)}/photos`, {
        method: 'POST',
        body: form
      })
    )
  },
  deletePhoto: (person: string, filename: string) =>
    unwrap(
      fetchImpl(
        `/admin/photos/persons/${encodeURIComponent(person)}/photos/${encodeURIComponent(filename)}`,
        { method: 'DELETE' }
      )
    ),

  // Unidentified tray (WF-9, PA-6)
  listUnidentified: () =>
    unwrap<PhotoItem[]>(fetchImpl('/admin/photos/unidentified')),
  deleteUnidentified: (filename: string) =>
    unwrap(
      fetchImpl(`/admin/photos/unidentified/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
      })
    ),
  promotePhoto: (filename: string, person: string) =>
    unwrap(
      fetchImpl(
        `/admin/photos/unidentified/${encodeURIComponent(filename)}/promote`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ person })
        }
      )
    )
})
