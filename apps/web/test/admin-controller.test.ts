import type { PersonItem, PhotoItem } from '@doorcloud/shared'
import type { Signal } from '@preact/signals'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  type AdminApi,
  type AdminController,
  type AdminControllerState,
  createAdminController
} from '../src/controller/admin-controller'

const person = (name: string, photoCount = 0): PersonItem => ({
  name,
  photoCount
})

const photo = (filename: string): PhotoItem => ({
  filename,
  url: `https://example.com/photos/${filename}`
})

let api: {
  [K in keyof AdminApi]: ReturnType<typeof vi.fn>
}
let controller: AdminController
let state: Signal<AdminControllerState>

const apiError = (status: number): Error => {
  const error = new Error(`Request failed (${status})`)

  error.name = 'ApiError'

  return error
}

beforeEach(() => {
  api = {
    listPersons: vi.fn().mockResolvedValue({
      owner: 'Ana',
      persons: [person('Bryan'), person('Henry', 2)]
    }),
    createPerson: vi.fn().mockResolvedValue(person('Diana')),
    renamePerson: vi.fn().mockResolvedValue(undefined),
    deletePerson: vi.fn().mockResolvedValue(undefined),
    listPhotos: vi.fn().mockResolvedValue([photo('p1.jpg'), photo('p2.jpg')]),
    uploadPhoto: vi
      .fn()
      .mockResolvedValue(['https://example.com/photos/n1.jpg']),
    deletePhoto: vi.fn().mockResolvedValue(undefined),
    listUnidentified: vi.fn().mockResolvedValue([photo('1785-nomatch.jpg')]),
    deleteUnidentified: vi.fn().mockResolvedValue(undefined),
    promotePhoto: vi.fn().mockResolvedValue(undefined)
  }
  controller = createAdminController({ api: api as unknown as AdminApi })
  state = controller.state
})

describe('AdminController (WF-7..9)', () => {
  test('load fetches persons, owner and tray in one pass', async () => {
    await controller.load()

    expect(state.value.persons.map(p => p.name)).toEqual(['Bryan', 'Henry'])
    expect(state.value.owner).toBe('Ana')
    expect(state.value.tray).toEqual([photo('1785-nomatch.jpg')])
    expect(state.value.loading).toBe(false)
    expect(state.value.error).toBeNull()
  })

  test('load surfaces a failure without clearing existing data', async () => {
    api.listPersons.mockRejectedValue(apiError(401))

    await controller.load()

    expect(state.value.error).toBe('Request failed (401)')
    expect(state.value.loading).toBe(false)
  })

  test('createPerson appends the new person and clears the error', async () => {
    await controller.load()

    const ok = await controller.createPerson('Diana')

    expect(ok).toBe(true)
    expect(state.value.persons.map(p => p.name)).toEqual([
      'Bryan',
      'Henry',
      'Diana'
    ])
    expect(state.value.error).toBeNull()
  })

  test('createPerson with an existing name reports the 409 message', async () => {
    await controller.load()
    api.createPerson.mockRejectedValue(apiError(409))

    const ok = await controller.createPerson('Bryan')

    expect(ok).toBe(false)
    expect(state.value.error).toBe('Request failed (409)')
    expect(state.value.persons.map(p => p.name)).toEqual(['Bryan', 'Henry'])
  })

  test('renamePerson replaces the name in the list', async () => {
    await controller.load()

    const ok = await controller.renamePerson('Bryan', 'Bryan Ramos')

    expect(ok).toBe(true)
    expect(state.value.persons.map(p => p.name)).toEqual([
      'Bryan Ramos',
      'Henry'
    ])
  })

  test('renamePerson failure (403 owner) sets the error and keeps the list', async () => {
    await controller.load()
    api.renamePerson.mockRejectedValue(apiError(403))

    const ok = await controller.renamePerson('Ana', 'Renamed')

    expect(ok).toBe(false)
    expect(state.value.error).toBe('Request failed (403)')
    expect(state.value.persons.map(p => p.name)).toEqual(['Bryan', 'Henry'])
  })

  test('deletePerson removes the person from the list', async () => {
    await controller.load()

    const ok = await controller.deletePerson('Henry')

    expect(ok).toBe(true)
    expect(state.value.persons.map(p => p.name)).toEqual(['Bryan'])
  })

  test('selectPerson loads photos and clears them when deselected', async () => {
    await controller.load()

    await controller.selectPerson('Bryan')

    expect(state.value.selectedPerson).toBe('Bryan')
    expect(state.value.photos).toEqual([photo('p1.jpg'), photo('p2.jpg')])

    await controller.selectPerson(null)

    expect(state.value.selectedPerson).toBeNull()
    expect(state.value.photos).toEqual([])
  })

  test('uploadPhotos appends the returned URLs to the selected photos', async () => {
    await controller.load()
    await controller.selectPerson('Bryan')

    const ok = await controller.uploadPhotos('Bryan', [
      { file: new Blob(['x']), name: 'n1.jpg' }
    ])

    expect(ok).toBe(true)
    expect(state.value.photos.map(p => p.url)).toEqual([
      'https://example.com/photos/p1.jpg',
      'https://example.com/photos/p2.jpg',
      'https://example.com/photos/n1.jpg'
    ])
  })

  test('deletePhoto removes the photo from the selection', async () => {
    await controller.load()
    await controller.selectPerson('Bryan')

    const ok = await controller.deletePhoto('Bryan', 'p1.jpg')

    expect(ok).toBe(true)
    expect(state.value.photos.map(p => p.filename)).toEqual(['p2.jpg'])
  })

  test('promotePhoto moves the tray photo to the selected person', async () => {
    await controller.load()

    const ok = await controller.promotePhoto('1785-nomatch.jpg', 'Henry')

    expect(ok).toBe(true)
    expect(api.promotePhoto).toHaveBeenCalledWith('1785-nomatch.jpg', 'Henry')
    expect(state.value.tray).toEqual([])
  })

  test('promotePhoto failure keeps the tray entry and sets the error', async () => {
    await controller.load()
    api.promotePhoto.mockRejectedValue(apiError(404))

    const ok = await controller.promotePhoto('1785-nomatch.jpg', 'Missing')

    expect(ok).toBe(false)
    expect(state.value.tray).toEqual([photo('1785-nomatch.jpg')])
    expect(state.value.error).toBe('Request failed (404)')
  })

  test('deleteUnidentified removes the tray entry', async () => {
    await controller.load()

    const ok = await controller.deleteUnidentified('1785-nomatch.jpg')

    expect(ok).toBe(true)
    expect(state.value.tray).toEqual([])
  })

  test('clearError resets the error signal', async () => {
    await controller.load()
    api.deletePerson.mockRejectedValue(apiError(500))
    await controller.deletePerson('Henry')

    controller.clearError()

    expect(state.value.error).toBeNull()
  })
})
