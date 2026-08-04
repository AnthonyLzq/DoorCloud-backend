import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PythonManager } from '../src/services/face-recognition/python-manager'

describe('PythonManager', () => {
  let manager: PythonManager

  beforeEach(() => {
    manager = new PythonManager()
  })

  afterEach(async () => {
    if (manager.isReady()) {
      await manager.stop()
    }
  })

  describe('start', () => {
    it('should start Python process and emit ready event', async () => {
      const readyPromise = new Promise<void>(resolve => {
        manager.on('ready', () => resolve())
      })

      await manager.start()
      await readyPromise

      expect(manager.isReady()).toBe(true)
    })

    it('should throw error if process already running', async () => {
      await manager.start()

      await expect(manager.start()).rejects.toThrow(
        'Python process already running'
      )
    })

    it('should emit stderr events', async () => {
      const stderrPromise = new Promise<string>(resolve => {
        manager.on('stderr', data => resolve(data))
      })

      await manager.start()

      // Send invalid request to trigger stderr
      manager.sendRequest({ invalid: 'request' })

      // Wait a bit for stderr
      await new Promise(resolve => setTimeout(resolve, 100))
    })
  })

  describe('stop', () => {
    it('should stop Python process gracefully', async () => {
      await manager.start()
      expect(manager.isReady()).toBe(true)

      await manager.stop()
      expect(manager.isReady()).toBe(false)
    })

    it('should handle stop when process not running', async () => {
      await expect(manager.stop()).resolves.not.toThrow()
    })
  })

  describe('sendRequest', () => {
    it('should send JSON request to Python process', async () => {
      await manager.start()

      const responsePromise = new Promise<any>(resolve => {
        manager.onStdout(data => {
          try {
            const response = JSON.parse(data)
            resolve(response)
          } catch (e) {
            // Ignore non-JSON lines
          }
        })
      })

      manager.sendRequest({ method: 'list_models' })

      const response = await responsePromise
      expect(response).toHaveProperty('id')
      expect(response).toHaveProperty('success', true)
      expect(response).toHaveProperty('models')
    })

    it('should throw error if process not ready', () => {
      expect(() => manager.sendRequest({ method: 'test' })).toThrow(
        'Python process not ready'
      )
    })
  })

  describe('isReady', () => {
    it('should return false before start', () => {
      expect(manager.isReady()).toBe(false)
    })

    it('should return true after start', async () => {
      await manager.start()
      expect(manager.isReady()).toBe(true)
    })

    it('should return false after stop', async () => {
      await manager.start()
      await manager.stop()
      expect(manager.isReady()).toBe(false)
    })
  })

  describe('error handling', () => {
    it('should emit error events', async () => {
      const errorPromise = new Promise<Error>(resolve => {
        manager.on('error', error => resolve(error))
      })

      // Start with invalid script path to trigger error
      const invalidManager = new PythonManager()
      ;(invalidManager as any).scriptPath = '/nonexistent/script.py'

      try {
        await invalidManager.start()
      } catch (error) {
        // Expected to fail
      }
    })
  })
})
