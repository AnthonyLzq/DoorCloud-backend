import type { OpenWaQr, OpenWaSetupStatus } from '@doorcloud/shared'
import { type Signal, signal } from '@preact/signals'

// WF-5: polling cadence and caps for the self-driving pairing flow.
export const POLL_INTERVAL = 3_000
export const MAX_POLLS = 20
export const MAX_FAILURES = 3

export type SetupPhase =
  | 'idle'
  | 'starting'
  | 'polling'
  | 'qr_ready'
  | 'connected'
  | 'error'
  | 'waiting'

export interface SetupControllerState {
  phase: SetupPhase
  status: OpenWaSetupStatus | null
  qrCode: string | null
  error: string | null
  polls: number
  lastChecked: Date | null
}

export interface SetupApi {
  getStatus: () => Promise<OpenWaSetupStatus>
  start: () => Promise<OpenWaSetupStatus>
  getQr: () => Promise<OpenWaQr>
}

export interface SetupControllerDeps {
  api: SetupApi
  setTimeout: typeof setTimeout
  clearTimeout: typeof clearTimeout
}

export interface SetupController {
  state: Signal<SetupControllerState>
  start: () => void
  refreshStatus: () => Promise<void>
  loadQr: () => Promise<void>
  dispose: () => void
}

const initialState = (): SetupControllerState => ({
  phase: 'idle',
  status: null,
  qrCode: null,
  error: null,
  polls: 0,
  lastChecked: null
})

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Request failed'

export const createSetupController = ({
  api,
  setTimeout: setTimeoutImpl,
  clearTimeout: clearTimeoutImpl
}: SetupControllerDeps): SetupController => {
  const state = signal<SetupControllerState>(initialState())

  let timer: ReturnType<typeof setTimeout> | null = null
  let pollCount = 0
  let failures = 0
  let disposed = false

  const setPhase = (
    phase: SetupPhase,
    patch: Partial<SetupControllerState> = {}
  ): void => {
    state.value = { ...state.value, phase, ...patch }
  }

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeoutImpl(timer)
      timer = null
    }
  }

  const scheduleNextPoll = (): void => {
    if (disposed) return
    timer = setTimeoutImpl(() => {
      void pollOnce()
    }, POLL_INTERVAL)
  }

  const pollOnce = async (): Promise<void> => {
    if (disposed || state.value.phase !== 'polling') return

    pollCount++

    try {
      const status = await api.getStatus()

      if (disposed || state.value.phase !== 'polling') return
      failures = 0
      state.value = { ...state.value, status, lastChecked: new Date() }

      // WF-5: stop on session: null (dead session), connected, or qr_ready
      if (!status.session) {
        setPhase('error', {
          error:
            'Session is not available. Click "Refresh status" to try again.'
        })
        clearTimer()
        return
      }

      if (status.session.status === 'connected') {
        setPhase('connected')
        clearTimer()
        return
      }

      if (status.session.status === 'qr_ready') {
        setPhase('qr_ready')
        clearTimer()
        void loadQr()
        return
      }

      if (pollCount >= MAX_POLLS) {
        setPhase('waiting')
        clearTimer()
        return
      }

      scheduleNextPoll()
    } catch (error) {
      if (disposed || state.value.phase !== 'polling') return

      failures++
      state.value = { ...state.value, lastChecked: new Date() }

      if (failures >= MAX_FAILURES) {
        setPhase('error', { error: errorMessage(error) })
        clearTimer()
        return
      }

      if (pollCount >= MAX_POLLS) {
        setPhase('waiting')
        clearTimer()
        return
      }

      scheduleNextPoll()
    }
  }

  const start = (): void => {
    // WF-4: repeated clicks must never start a second poll loop
    if (state.value.phase === 'starting' || state.value.phase === 'polling')
      return

    failures = 0
    pollCount = 0
    clearTimer()
    setPhase('starting', { error: null, qrCode: null })

    void (async () => {
      try {
        const status = await api.start()

        if (disposed) return

        if (status.session?.status === 'connected') {
          setPhase('connected', { status, lastChecked: new Date() })
          return
        }

        pollCount = 0
        setPhase('polling', { status, lastChecked: new Date() })
        void pollOnce()
      } catch (error) {
        if (disposed) return
        setPhase('error', { error: errorMessage(error) })
      }
    })()
  }

  // WF-3 / WF-6: a single manual/on-load status check (never during the
  // start flow, which owns the phase transitions).
  const refreshStatus = async (): Promise<void> => {
    if (state.value.phase === 'starting' || state.value.phase === 'polling')
      return

    try {
      const status = await api.getStatus()

      if (disposed) return
      state.value = { ...state.value, status, lastChecked: new Date() }

      if (status.session?.status === 'connected') {
        setPhase('connected')
        return
      }

      if (status.session?.status === 'qr_ready') {
        setPhase('qr_ready')
        void loadQr()
        return
      }

      setPhase('idle')
    } catch (error) {
      if (disposed) return
      setPhase('error', { error: errorMessage(error) })
    }
  }

  const loadQr = async (): Promise<void> => {
    try {
      const { qrCode } = await api.getQr()

      if (disposed) return
      setPhase('qr_ready', { qrCode, error: null })
    } catch (error) {
      if (disposed) return
      setPhase('error', { error: errorMessage(error) })
    }
  }

  const dispose = (): void => {
    disposed = true
    clearTimer()
  }

  return { state, start, refreshStatus, loadQr, dispose }
}
