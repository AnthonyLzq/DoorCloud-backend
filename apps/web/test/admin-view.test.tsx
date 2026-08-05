// @vitest-environment happy-dom
// Component tests for the Admin view (WF-7..9): the view must read the
// persons/photos/tray state from the injected controller store and wire
// every mutation button to the right store method.

import type { PersonItem, PhotoItem } from '@doorcloud/shared'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Admin, type AdminViewApi } from '../src/views/Admin'

const person = (name: string, photoCount = 0): PersonItem => ({
  name,
  photoCount
})

const photo = (filename: string): PhotoItem => ({
  filename,
  url: `https://example.com/photos/${filename}`
})

type MockAdminApi = {
  [K in keyof AdminViewApi]: ReturnType<typeof vi.fn>
}

const makeApi = (): MockAdminApi => ({
  listPersons: vi.fn().mockResolvedValue({
    owner: 'Ana',
    persons: [person('Bryan', 3), person('Henry', 2), person('Ana', 5)]
  }),
  listUnidentified: vi.fn().mockResolvedValue([photo('1785-no-match.jpg')]),
  createPerson: vi.fn().mockResolvedValue(person('Diana')),
  renamePerson: vi.fn().mockResolvedValue(undefined),
  deletePerson: vi.fn().mockResolvedValue(undefined),
  listPhotos: vi.fn().mockResolvedValue([photo('p1.jpg'), photo('p2.jpg')]),
  uploadPhoto: vi.fn().mockResolvedValue(['https://example.com/photos/u.jpg']),
  deletePhoto: vi.fn().mockResolvedValue(undefined),
  deleteUnidentified: vi.fn().mockResolvedValue(undefined),
  promotePhoto: vi.fn().mockResolvedValue(undefined)
})

const personsSection = (): HTMLElement =>
  screen.getByText('Known persons').closest('section')!

const renderAdmin = (api: MockAdminApi): void => {
  render(<Admin api={api as unknown as AdminViewApi} />)
}

// Waits for the initial controller.load() (persons + tray) to render.
const awaitLoad = (): Promise<void> => {
  return screen.findByText('3 photos').then(() => undefined)
}

beforeEach(() => {
  vi.stubGlobal('prompt', (): string | null => null)
  vi.stubGlobal('confirm', (): boolean => false)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Admin view (WF-7..9)', () => {
  test('renders the person list, counts, owner and tray from the store', async () => {
    const api = makeApi()
    renderAdmin(api)

    await awaitLoad()

    const list = personsSection().textContent
    expect(list).toContain('Bryan')
    expect(list).toContain('Henry')
    expect(list).toContain('3 photos')
    expect(list).toContain('5 photos')
    expect(screen.getByText('1785-no-match.jpg')).toBeTruthy()
    expect(api.listPersons).toHaveBeenCalledTimes(1)
    expect(api.listUnidentified).toHaveBeenCalledTimes(1)
  })

  test('owner row hides the rename and delete buttons', async () => {
    renderAdmin(makeApi())

    await awaitLoad()

    // Only Bryan and Henry are editable; Ana (the owner) is not.
    expect(screen.getAllByRole('button', { name: 'Rename' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(3)

    const anaRow = [...screen.getAllByRole('listitem')].find(li =>
      li.textContent?.includes('Ana')
    )
    expect(anaRow).toBeTruthy()
    expect(anaRow?.querySelectorAll('button').length).toBe(1)
  })

  test('Add calls createPerson and appends the new person', async () => {
    const api = makeApi()
    renderAdmin(api)

    await awaitLoad()

    fireEvent.input(screen.getByPlaceholderText('New person name'), {
      target: { value: 'Diana' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(api.createPerson).toHaveBeenCalledWith('Diana'))
    await waitFor(() => expect(personsSection().textContent).toContain('Diana'))
  })

  test('error banner shows controller errors and Dismiss clears them', async () => {
    const api = makeApi()
    api.listPersons.mockRejectedValue(new Error('Request failed (401)'))
    renderAdmin(api)

    await screen.findByRole('alert')

    expect(screen.getByRole('alert').textContent).toContain(
      'Request failed (401)'
    )

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  test('Rename prompt triggers renamePerson and updates the list', async () => {
    vi.stubGlobal('prompt', (): string | null => 'Bryan Ramos')
    const api = makeApi()
    renderAdmin(api)

    await awaitLoad()

    fireEvent.click(screen.getAllByRole('button', { name: 'Rename' })[0])

    await waitFor(() =>
      expect(api.renamePerson).toHaveBeenCalledWith('Bryan', 'Bryan Ramos')
    )
    await waitFor(() =>
      expect(personsSection().textContent).toContain('Bryan Ramos')
    )
  })

  test('Delete confirm triggers deletePerson and removes the row', async () => {
    vi.stubGlobal('confirm', (): boolean => true)
    const api = makeApi()
    renderAdmin(api)

    await awaitLoad()

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0])

    await waitFor(() => expect(api.deletePerson).toHaveBeenCalledWith('Bryan'))
    await waitFor(() =>
      expect(personsSection().textContent).not.toContain('Bryan')
    )
  })

  test('selecting a person swaps the photos list', async () => {
    const api = makeApi()
    renderAdmin(api)

    await awaitLoad()

    fireEvent.click(screen.getByRole('button', { name: /Bryan 3 photos/ }))

    await waitFor(() => expect(api.listPhotos).toHaveBeenCalledWith('Bryan'))
    await screen.findByText('p1.jpg')
    expect(screen.getByText('p2.jpg')).toBeTruthy()
  })

  test('tray Promote calls promotePhoto and clears the entry', async () => {
    const api = makeApi()
    renderAdmin(api)

    await awaitLoad()

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'Henry' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Promote' }))

    await waitFor(() =>
      expect(api.promotePhoto).toHaveBeenCalledWith(
        '1785-no-match.jpg',
        'Henry'
      )
    )
    await waitFor(() =>
      expect(screen.getByText('Nothing waiting.')).toBeTruthy()
    )
  })

  test('tray Delete calls deleteUnidentified and clears the entry', async () => {
    const api = makeApi()
    renderAdmin(api)

    await awaitLoad()

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)

    await waitFor(() =>
      expect(api.deleteUnidentified).toHaveBeenCalledWith('1785-no-match.jpg')
    )
    await waitFor(() =>
      expect(screen.getByText('Nothing waiting.')).toBeTruthy()
    )
  })
})
