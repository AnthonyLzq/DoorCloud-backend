import type { PersonItem, PhotoItem } from '@doorcloud/shared'
import { type Signal, signal } from '@preact/signals'

// WF-7..9: the photo-admin store. Pure signal state + injected api so the
// view stays declarative and the controller is unit-testable without DOM.

export interface AdminApi {
  listPersons: () => Promise<{ owner: string; persons: PersonItem[] }>
  createPerson: (name: string) => Promise<PersonItem>
  renamePerson: (from: string, to: string) => Promise<unknown>
  deletePerson: (name: string) => Promise<unknown>
  listPhotos: (person: string) => Promise<PhotoItem[]>
  uploadPhoto: (
    person: string,
    file: Blob,
    filename: string
  ) => Promise<string[]>
  deletePhoto: (person: string, filename: string) => Promise<unknown>
  listUnidentified: () => Promise<PhotoItem[]>
  deleteUnidentified: (filename: string) => Promise<unknown>
  promotePhoto: (filename: string, person: string) => Promise<unknown>
}

export interface AdminControllerState {
  owner: string | null
  persons: PersonItem[]
  tray: PhotoItem[]
  selectedPerson: string | null
  photos: PhotoItem[]
  error: string | null
  loading: boolean
}

export interface AdminController {
  state: Signal<AdminControllerState>
  load: () => Promise<void>
  createPerson: (name: string) => Promise<boolean>
  renamePerson: (from: string, to: string) => Promise<boolean>
  deletePerson: (name: string) => Promise<boolean>
  selectPerson: (name: string | null) => Promise<void>
  uploadPhotos: (
    person: string,
    files: { file: Blob; name: string }[]
  ) => Promise<boolean>
  deletePhoto: (person: string, filename: string) => Promise<boolean>
  promotePhoto: (filename: string, person: string) => Promise<boolean>
  deleteUnidentified: (filename: string) => Promise<boolean>
  clearError: () => void
}

const initialState = (): AdminControllerState => ({
  owner: null,
  persons: [],
  tray: [],
  selectedPerson: null,
  photos: [],
  error: null,
  loading: false
})

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Request failed'

type RunResult<T> = { ok: true; value: T } | { ok: false }

export const createAdminController = ({
  api
}: {
  api: AdminApi
}): AdminController => {
  const state = signal<AdminControllerState>(initialState())

  const run = async <T>(action: () => Promise<T>): Promise<RunResult<T>> => {
    try {
      return { ok: true, value: await action() }
    } catch (error) {
      state.value = { ...state.value, error: errorMessage(error) }

      return { ok: false }
    }
  }

  return {
    state,

    load: async () => {
      state.value = { ...state.value, loading: true, error: null }

      const result = await run(async () => {
        const [list, tray] = await Promise.all([
          api.listPersons(),
          api.listUnidentified()
        ])

        return { owner: list.owner, persons: list.persons, tray }
      })

      state.value = {
        ...state.value,
        ...(result.ok ? result.value : { owner: null, persons: [], tray: [] }),
        loading: false
      }
    },

    createPerson: async name => {
      const created = await run(() => api.createPerson(name))

      if (!created.ok) return false

      state.value = {
        ...state.value,
        persons: [...state.value.persons, created.value],
        error: null
      }

      return true
    },

    renamePerson: async (from, to) => {
      const renamed = await run(() => api.renamePerson(from, to))

      if (!renamed.ok) return false

      state.value = {
        ...state.value,
        persons: state.value.persons.map(p =>
          p.name === from ? { ...p, name: to } : p
        ),
        error: null
      }

      return true
    },

    deletePerson: async name => {
      const deleted = await run(() => api.deletePerson(name))

      if (!deleted.ok) return false

      state.value = {
        ...state.value,
        persons: state.value.persons.filter(p => p.name !== name),
        error: null
      }

      return true
    },

    selectPerson: async name => {
      if (!name) {
        state.value = { ...state.value, selectedPerson: null, photos: [] }

        return
      }

      const photos = await run(() => api.listPhotos(name))

      state.value = {
        ...state.value,
        selectedPerson: name,
        photos: photos.ok ? photos.value : [],
        error: photos.ok ? null : state.value.error
      }
    },

    uploadPhotos: async (person, files) => {
      const uploaded: PhotoItem[] = []

      for (const { file, name } of files) {
        const urls = await run(() => api.uploadPhoto(person, file, name))

        if (!urls.ok) return false
        uploaded.push(...urls.value.map(url => ({ filename: name, url })))
      }

      state.value = {
        ...state.value,
        photos: [...state.value.photos, ...uploaded],
        error: null
      }

      return true
    },

    deletePhoto: async (person, filename) => {
      const deleted = await run(() => api.deletePhoto(person, filename))

      if (!deleted.ok) return false

      state.value = {
        ...state.value,
        photos: state.value.photos.filter(p => p.filename !== filename),
        error: null
      }

      return true
    },

    promotePhoto: async (filename, person) => {
      const promoted = await run(() => api.promotePhoto(filename, person))

      if (!promoted.ok) return false

      state.value = {
        ...state.value,
        tray: state.value.tray.filter(p => p.filename !== filename),
        error: null
      }

      return true
    },

    deleteUnidentified: async filename => {
      const deleted = await run(() => api.deleteUnidentified(filename))

      if (!deleted.ok) return false

      state.value = {
        ...state.value,
        tray: state.value.tray.filter(p => p.filename !== filename),
        error: null
      }

      return true
    },

    clearError: () => {
      state.value = { ...state.value, error: null }
    }
  }
}
