import type { OpenWaSetupStatus } from '@doorcloud/shared'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  createSetupController,
  MAX_FAILURES,
  MAX_POLLS,
  POLL_INTERVAL
} from '../src/controller/setup-controller'

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

const session = (status: string) => ({ id: 'session-1', status })

interface Harness {
  api: {
    getStatus: ReturnType<typeof vi.fn>
    start: ReturnType<typeof vi.fn>
    getQr: ReturnType<typeof vi.fn>
  }
  controller: ReturnType<typeof createSetupController>
}

const makeHarness = (): Harness => {
  const api = {
    getStatus: vi.fn(),
    start: vi.fn(),
    getQr: vi.fn()
  }
  const controller = createSetupController({
    api,
    setTimeout,
    clearTimeout
  })

  return { api, controller }
}

// Flushes pending microtasks (awaited promises) without advancing timers.
const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0)
  await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createSetupController (WF-3..6)', () => {
  test('start() polls and stops on qr_ready, auto-loading the QR', async () => {
    const { api, controller } = makeHarness()
    api.start.mockResolvedValue(statusWith(session('created')))
    api.getQr.mockResolvedValue({ qrCode: 'data:image/png;base64,qr' })
    let resolveStatus!: (status: OpenWaSetupStatus) => void
    api.getStatus.mockReturnValue(
      new Promise<OpenWaSetupStatus>(resolve => {
        resolveStatus = resolve
      })
    )

    controller.start()
    await flush()

    // The immediate poll is pending: the view stays in 'polling'
    expect(controller.state.value.phase).toBe('polling')
    expect(api.start).toHaveBeenCalledTimes(1)

    resolveStatus(statusWith(session('qr_ready')))
    await flush()

    expect(controller.state.value.phase).toBe('qr_ready')
    expect(controller.state.value.qrCode).toBe('data:image/png;base64,qr')
    expect(api.getQr).toHaveBeenCalledTimes(1)

    // Polling stopped: advancing more time does not re-check status
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL * 5)
    expect(api.getStatus).toHaveBeenCalledTimes(1)
  })

  test('start() stops polling when the session is connected', async () => {
    const { api, controller } = makeHarness()
    api.start.mockResolvedValue(statusWith(session('created')))
    api.getStatus.mockResolvedValue(statusWith(session('connected')))

    controller.start()
    await flush()
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
    await flush()

    expect(controller.state.value.phase).toBe('connected')
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL * 5)
    expect(api.getStatus).toHaveBeenCalledTimes(1)
  })

  test('start() stops polling when the status reports session: null', async () => {
    const { api, controller } = makeHarness()
    api.start.mockResolvedValue(statusWith(session('created')))
    api.getStatus.mockResolvedValue(statusWith(null))

    controller.start()
    await flush()
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
    await flush()

    expect(controller.state.value.phase).toBe('error')
    expect(controller.state.value.error).toMatch(/session/i)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL * 5)
    expect(api.getStatus).toHaveBeenCalledTimes(1)
  })

  test('stops after MAX_POLLS unpaired polls and shows the waiting state', async () => {
    const { api, controller } = makeHarness()
    api.start.mockResolvedValue(statusWith(session('created')))
    api.getStatus.mockResolvedValue(statusWith(session('disconnected')))

    controller.start()
    await flush()

    for (let i = 0; i < MAX_POLLS + 2; i++) {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
      await flush()
    }

    expect(controller.state.value.phase).toBe('waiting')
    expect(api.getStatus).toHaveBeenCalledTimes(MAX_POLLS)
  })

  test('enters the error state after MAX_FAILURES consecutive poll failures', async () => {
    const { api, controller } = makeHarness()
    api.start.mockResolvedValue(statusWith(session('created')))
    api.getStatus.mockRejectedValue(new Error('network down'))

    controller.start()
    await flush()

    for (let i = 0; i < MAX_FAILURES + 2; i++) {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
      await flush()
    }

    expect(controller.state.value.phase).toBe('error')
    expect(controller.state.value.error).toBe('network down')
    expect(api.getStatus).toHaveBeenCalledTimes(MAX_FAILURES)
  })

  test('resets the failure counter after a successful poll', async () => {
    const { api, controller } = makeHarness()
    api.start.mockResolvedValue(statusWith(session('created')))
    api.getStatus
      .mockRejectedValueOnce(new Error('first failure'))
      .mockRejectedValueOnce(new Error('second failure'))
      .mockResolvedValue(statusWith(session('disconnected')))

    controller.start()
    await flush()
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
    await flush()
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
    await flush()
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
    await flush()

    // Immediate poll + 3 timer polls: two failures then successes keep the
    // loop running instead of entering the error state
    expect(controller.state.value.phase).toBe('polling')
    expect(api.getStatus).toHaveBeenCalledTimes(4)
  })

  test('guards against double start while starting or polling', async () => {
    const { api, controller } = makeHarness()
    api.start.mockReturnValue(new Promise(() => undefined))

    controller.start()
    controller.start()
    controller.start()

    expect(api.start).toHaveBeenCalledTimes(1)
    expect(controller.state.value.phase).toBe('starting')
  })

  test('page-load refreshStatus shows idle with the session disconnected', async () => {
    const { api, controller } = makeHarness()
    api.getStatus.mockResolvedValue(statusWith(session('disconnected')))

    await controller.refreshStatus()

    expect(controller.state.value.phase).toBe('idle')
    expect(controller.state.value.status?.session?.status).toBe('disconnected')
  })

  test('page-load refreshStatus auto-loads the QR when already qr_ready', async () => {
    const { api, controller } = makeHarness()
    api.getStatus.mockResolvedValue(statusWith(session('qr_ready')))
    api.getQr.mockResolvedValue({ qrCode: 'data:image/png;base64,qr' })

    await controller.refreshStatus()

    expect(controller.state.value.phase).toBe('qr_ready')
    expect(api.getQr).toHaveBeenCalledTimes(1)
  })

  test('manual refreshStatus recovers from the error state with one request', async () => {
    const { api, controller } = makeHarness()
    api.start.mockResolvedValue(statusWith(session('created')))
    api.getStatus
      .mockRejectedValueOnce(new Error('network down'))
      .mockRejectedValueOnce(new Error('network down'))
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(statusWith(session('connected')))

    controller.start()
    await flush()
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
    await flush()
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
    await flush()
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL)
    await flush()

    expect(controller.state.value.phase).toBe('error')

    // Manual recovery: a single status check after the error
    await controller.refreshStatus()

    expect(controller.state.value.phase).toBe('connected')
    expect(api.getStatus).toHaveBeenCalledTimes(4)
  })
})
