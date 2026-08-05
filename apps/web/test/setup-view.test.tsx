// @vitest-environment happy-dom
// Component tests for the Setup view (WF-1..6): the page-load status check,
// auto-QR load, connected rendering and Start button wiring driven through
// the setup controller with an injected fake api.

import type { OpenWaSetupStatus } from '@doorcloud/shared'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/preact'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { Setup, type SetupViewApi } from '../src/views/Setup'

type MockSetupApi = {
  [K in keyof SetupViewApi]: ReturnType<typeof vi.fn>
}

const statusWith = (
  session: OpenWaSetupStatus['session'],
  overrides: Partial<OpenWaSetupStatus> = {}
): OpenWaSetupStatus => ({
  configured: true,
  configuredChatId: '51999999999@c.us',
  configuredSessionId: 'main',
  missing: [],
  session,
  ...overrides
})

const session = (status: string, id = 'session-1') => ({ id, status })

const makeApi = (): MockSetupApi => ({
  getSetupStatus: vi.fn(),
  startSetupSession: vi.fn(),
  getSetupQr: vi.fn(),
  saveSetupConfig: vi.fn().mockResolvedValue({ saved: ['OPENWA_CHAT_ID'] }),
  sendSetupTest: vi.fn().mockResolvedValue(undefined)
})

const renderSetup = (api: MockSetupApi): void => {
  render(<Setup api={api as unknown as SetupViewApi} />)
}

const startButton = (): HTMLButtonElement =>
  screen.getByRole('button', { name: 'Start session' }) as HTMLButtonElement

afterEach(() => {
  cleanup()
})

describe('Setup view (WF-1..6)', () => {
  test('auto-loads the QR when the page-load status is qr_ready', async () => {
    const api = makeApi()
    api.getSetupStatus.mockResolvedValue(statusWith(session('qr_ready')))
    api.getSetupQr.mockResolvedValue({ qrCode: 'data:image/png;base64,qr' })
    renderSetup(api)

    await screen.findByAltText('OpenWA sign-in QR')

    expect(screen.getByAltText('OpenWA sign-in QR').getAttribute('src')).toBe(
      'data:image/png;base64,qr'
    )
    expect(api.getSetupQr).toHaveBeenCalledTimes(1)
  })

  test('shows the connected session and disables Start', async () => {
    const api = makeApi()
    api.getSetupStatus.mockResolvedValue(statusWith(session('connected')))
    renderSetup(api)

    await screen.findByText(/Connected as session/)

    expect(startButton().disabled).toBe(true)
    expect(screen.getByText(/Connected as session/).textContent).toContain(
      'session-1'
    )
  })

  test('Start calls startSetupSession and flows into connected', async () => {
    const api = makeApi()
    api.getSetupStatus.mockResolvedValue(statusWith(session('disconnected')))
    api.startSetupSession.mockResolvedValue(statusWith(session('connected')))
    renderSetup(api)

    // The status <pre> only renders once the page-load refreshStatus has
    // settled (phase 'idle'); clicking earlier races the pending refresh.
    await screen.findByText(/configuredChatId/)

    fireEvent.click(startButton())

    await waitFor(() => expect(api.startSetupSession).toHaveBeenCalledTimes(1))
    await screen.findByText(/Connected as session/)
  })

  test('Start is disabled while the session is starting', async () => {
    const api = makeApi()
    api.getSetupStatus.mockResolvedValue(statusWith(session('disconnected')))
    api.startSetupSession.mockReturnValue(new Promise(() => undefined))
    renderSetup(api)

    await screen.findByText(/configuredChatId/)

    fireEvent.click(startButton())

    await waitFor(() => expect(startButton().disabled).toBe(true))
  })
})
