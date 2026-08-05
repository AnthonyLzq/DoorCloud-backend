import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pythonServerScript } from '../src/config/paths'
import { PythonManager } from '../src/services/face-recognition/python-manager'

// The manager spawns a real Python IPC server (venv + script). For the
// hermetic unit suite (CI has no venv/model files), the child process is
// mocked and the READY/JSON-line protocol is driven by the test.
const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }))

vi.mock('node:child_process', () => ({ spawn }))
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()

  return { ...actual, existsSync: vi.fn(() => true) }
})

// existsSync is mocked by the node:fs factory above; narrow the type so the
// per-test flip below compiles.
const mockExistsSync = existsSync as unknown as {
  mockReturnValue: (value: boolean) => void
}

class MockChild extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  stdin = { write: vi.fn() }

  killed = false

  kill(signal: string): boolean {
    this.killed = true
    this.emit('exit', 0, signal)

    return true
  }
}

// Emit 'READY' on stdout after start() attaches its listeners (next tick),
// so the manager's waitForReady (50ms poll) resolves.
const makeChild = (): MockChild => {
  const child = new MockChild()

  setTimeout(() => child.stdout.emit('data', Buffer.from('READY\n')), 0)

  return child
}

let manager: PythonManager

beforeEach(() => {
  vi.clearAllMocks()
  spawn.mockReturnValue(makeChild())
  manager = new PythonManager()
})

afterEach(async () => {
  if (manager.isReady()) await manager.stop()
})

describe('PythonManager (hermetic)', () => {
  it('spawns the venv+script, becomes ready on READY and reports isReady', async () => {
    await manager.start()

    expect(spawn).toHaveBeenCalledTimes(1)
    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      [pythonServerScript],
      expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] })
    )
    expect(manager.isReady()).toBe(true)
  })

  it('throws when start is called twice', async () => {
    await manager.start()

    await expect(manager.start()).rejects.toThrow(
      'Python process already running'
    )
  })

  it('stop: kills the process, resets state and resolves on exit', async () => {
    await manager.start()
    const child = spawn.mock.results[0].value as MockChild

    await manager.stop()

    expect(child.killed).toBe(true)
    expect(manager.isReady()).toBe(false)
  })

  it('stop: resolves when the process is not running', async () => {
    await expect(manager.stop()).resolves.toBeUndefined()
  })

  it('sendRequest throws when the process is not ready', () => {
    expect(() =>
      manager.sendRequest({ method: 'load_model', args: [] })
    ).toThrow('Python process not ready')
  })

  it('relays stderr lines as stderr events', async () => {
    await manager.start()
    const child = spawn.mock.results[0].value as MockChild
    const linePromise = new Promise<string>(resolve => {
      manager.on('stderr', resolve)
    })

    child.stderr.emit(
      'data',
      Buffer.from('Traceback (most recent call last)\n')
    )

    await expect(linePromise).resolves.toContain('Traceback')
  })

  it('emits an error event on a process error', async () => {
    await manager.start()
    const child = spawn.mock.results[0].value as MockChild
    const errorPromise = new Promise<Error>(resolve => {
      manager.on('error', resolve)
    })

    child.emit('error', new Error('boom'))

    const emitted = await errorPromise
    expect(emitted.message).toContain('Python process error')
  })

  it('rejects start when the IPC server script is missing', async () => {
    mockExistsSync.mockReturnValue(false)

    await expect(manager.start()).rejects.toThrow(/not found/i)
  })
})
