import { type ChildProcess, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { resolve } from 'node:path'

export class PythonManager extends EventEmitter {
  private process: ChildProcess | null = null
  private scriptPath: string
  private venvPath: string
  private ready: boolean = false
  private restartAttempts: number = 0
  private maxRestartAttempts: number = 3
  private restartDelay: number = 1000

  constructor() {
    super()
    this.scriptPath = resolve(process.cwd(), 'scripts/face_recognition_server.py')
    this.venvPath = resolve(process.cwd(), '.venv/bin/python3')
  }

  async start(): Promise<void> {
    if (this.process) {
      throw new Error('Python process already running')
    }

    this.process = spawn(this.venvPath, [this.scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.process.on('error', (error) => {
      this.emit('error', error)
      this.handleCrash()
    })

    this.process.on('exit', (code) => {
      this.ready = false
      this.emit('exit', code)
      if (code !== 0 && code !== null) {
        this.handleCrash()
      }
    })

    this.process.stderr?.on('data', (data) => {
      this.emit('stderr', data.toString())
    })

    // Wait for READY signal
    await this.waitForReady()
    this.restartAttempts = 0
    this.emit('ready')
  }

  async stop(): Promise<void> {
    if (!this.process) {
      return
    }

    return new Promise((resolve) => {
      this.process!.once('exit', () => {
        this.process = null
        this.ready = false
        resolve()
      })

      this.process!.kill('SIGTERM')

      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL')
        }
      }, 5000)
    })
  }

  isReady(): boolean {
    return this.ready
  }

  private async waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Python process did not send READY signal within 30 seconds'))
      }, 30000)

      const onData = (data: Buffer) => {
        const output = data.toString()
        if (output.includes('READY')) {
          clearTimeout(timeout)
          this.process!.stdout!.removeListener('data', onData)
          this.ready = true
          resolve()
        }
      }

      this.process!.stdout!.on('data', onData)
    })
  }

  private handleCrash(): void {
    this.process = null
    this.ready = false

    if (this.restartAttempts < this.maxRestartAttempts) {
      this.restartAttempts++
      this.emit('restart', this.restartAttempts)
      setTimeout(() => {
        this.start().catch((error) => {
          this.emit('error', error)
        })
      }, this.restartDelay * this.restartAttempts)
    } else {
      this.emit('max-restarts-exceeded')
    }
  }

  sendRequest(request: object): void {
    if (!this.process || !this.ready) {
      throw new Error('Python process not ready')
    }

    const json = JSON.stringify(request) + '\n'
    this.process.stdin!.write(json)
  }

  onStdout(callback: (data: string) => void): void {
    if (!this.process) {
      throw new Error('Python process not started')
    }

    this.process.stdout!.on('data', (data) => {
      callback(data.toString())
    })
  }
}
