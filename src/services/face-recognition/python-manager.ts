/**
 * PythonManager - Gestor de comunicación IPC con proceso Python
 *
 * Este módulo implementa la comunicación entre Node.js y un proceso Python
 * para ejecutar modelos de face recognition que no están disponibles en ONNX Runtime.
 *
 * ## Arquitectura de Comunicación
 *
 * La comunicación se realiza mediante pipes stdin/stdout usando un protocolo
 * JSON-line con correlación por ID. Ver docs/adr/001-python-ipc-communication.md
 * para detalles completos de la decisión arquitectónica.
 *
 * ## Flujo de Comunicación
 *
 * ```
 * 1. Node.js spawnea proceso Python con stdio: ['pipe', 'pipe', 'pipe']
 * 2. Python imprime "READY" en stdout
 * 3. Node.js detecta "READY" y marca el proceso como listo
 * 4. Node.js envía request JSON en stdin (con ID único)
 * 5. Python lee stdin, procesa, escribe response JSON en stdout (con mismo ID)
 * 6. Node.js lee stdout, parsea JSON, correlaciona por ID, resuelve Promise
 * ```
 *
 * ## Protocolo de Mensajería
 *
 * ### Request (Node.js → Python via stdin)
 * ```json
 * {"id":1,"method":"load_model","args":["test-model",{"type":"dlib","path":"..."}]}
 * ```
 *
 * ### Response (Python → Node.js via stdout)
 * ```json
 * // Éxito:
 * {"id":1,"success":true,"model":"test-model"}
 *
 * // Error:
 * {"id":1,"error":"Missing model type or path"}
 * ```
 *
 * ## Características
 *
 * - **Correlación por ID**: Cada request tiene un ID único para correlacionar con response
 * - **Timeout**: 30 segundos por defecto, configurable
 * - **Buffering**: Acumulación de datos hasta encontrar newline
 * - **Concurrencia**: Múltiples requests pueden estar pendientes simultáneamente
 * - **Tipado**: Validación de schemas con Zod
 * - **Reinicio automático**: Hasta 3 intentos si el proceso Python crashea
 *
 * ## Uso
 *
 * ```typescript
 * const manager = new PythonManager()
 * await manager.start()
 *
 * // Cargar modelo
 * await manager.call('load_model', 'my-model', {
 *   type: 'dlib',
 *   path: 'models/dlib/dlib_face_recognition_resnet_model_v1.dat'
 * })
 *
 * // Obtener embedding
 * const embedding = await manager.call('get_embedding', imageBase64, 'my-model')
 *
 * await manager.stop()
 * ```
 *
 * @see {@link file://./python-schemas.ts} - Schemas de validación
 * @see {@link file://../../../../scripts/face_recognition_server.py} - Servidor Python
 * @see {@link file://../../../../docs/adr/001-python-ipc-communication.md} - ADR completo
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { resolve } from 'node:path'
import { type PythonRequest, PythonResponseSchema } from './python-schemas'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
  method: string
}

export class PythonManager extends EventEmitter {
  private process: ChildProcess | null = null
  private scriptPath: string
  private venvPath: string
  private ready: boolean = false
  private restartAttempts: number = 0
  private maxRestartAttempts: number = 3
  private restartDelay: number = 1000
  private requestId: number = 0
  private pendingRequests: Map<number, PendingRequest> = new Map()
  private stdoutBuffer: string = ''
  private defaultTimeout: number = 30000

  constructor() {
    super()
    this.scriptPath = resolve(
      process.cwd(),
      'scripts/face_recognition_server.py'
    )
    this.venvPath = resolve(process.cwd(), '.venv/bin/python3')
  }

  async start(): Promise<void> {
    if (this.process) {
      throw new Error('Python process already running')
    }

    console.log(
      `[PythonManager] Starting Python process: ${this.venvPath} ${this.scriptPath}`
    )

    this.process = spawn(this.venvPath, [this.scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.process.on('error', error => {
      const processError = new Error(`Python process error: ${error.message}`)
      processError.name = 'PythonProcessError'
      console.error(`[PythonManager] ${processError.message}`)
      this.emit('error', processError)
      this.handleCrash()
    })

    this.process.on('exit', (code, signal) => {
      this.ready = false
      const exitMessage = `Python process exited with code: ${code}, signal: ${signal}`
      console.log(`[PythonManager] ${exitMessage}`)
      this.emit('exit', code, signal)

      if (code !== 0 && code !== null) {
        this.handleCrash()
      }
    })

    this.process.stderr?.on('data', data => {
      const stderrMessage = data.toString().trim()
      if (stderrMessage) {
        console.error(`[PythonManager] stderr: ${stderrMessage}`)
        this.emit('stderr', stderrMessage)
      }
    })

    this.process.stdout?.on('data', data => {
      this.handleStdout(data.toString())
    })

    // Wait for READY signal
    await this.waitForReady()
    this.restartAttempts = 0
    console.log('[PythonManager] Python process ready')
  }

  async stop(): Promise<void> {
    if (!this.process) {
      return
    }

    console.log('[PythonManager] Stopping Python process...')

    // Reject all pending requests with detailed error
    for (const [_id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout)
      const error = new Error(
        `Python process stopped while waiting for response to method: ${pending.method}`
      )
      error.name = 'PythonProcessStopped'
      pending.reject(error)
    }
    this.pendingRequests.clear()
    this.stdoutBuffer = ''

    return new Promise(resolve => {
      this.process!.once('exit', code => {
        console.log(`[PythonManager] Python process exited with code: ${code}`)
        this.process = null
        this.ready = false
        resolve()
      })

      this.process!.kill('SIGTERM')

      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.process) {
          console.warn('[PythonManager] Force killing Python process (SIGKILL)')
          this.process.kill('SIGKILL')
        }
      }, 5000)
    })
  }

  isReady(): boolean {
    return this.ready
  }

  private async waitForReady(): Promise<void> {
    const maxWait = 30000
    const checkInterval = 50
    const startTime = Date.now()

    return new Promise((resolve, reject) => {
      const check = () => {
        if (this.ready) {
          resolve()
          return
        }

        if (Date.now() - startTime >= maxWait) {
          reject(
            new Error(
              'Python process did not send READY signal within 30 seconds'
            )
          )
          return
        }

        setTimeout(check, checkInterval)
      }

      check()
    })
  }

  private handleCrash(): void {
    this.process = null
    this.ready = false

    // Reject all pending requests with detailed error
    for (const [_id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout)
      const error = new Error(
        `Python process crashed while waiting for response to method: ${pending.method}`
      )
      error.name = 'PythonProcessCrashed'
      this.emit('error', error)
      pending.reject(error)
    }
    this.pendingRequests.clear()

    if (this.restartAttempts < this.maxRestartAttempts) {
      this.restartAttempts++
      const restartMessage = `Restarting Python process (attempt ${this.restartAttempts}/${this.maxRestartAttempts})`
      console.log(`[PythonManager] ${restartMessage}`)
      this.emit('restart', this.restartAttempts)

      setTimeout(() => {
        this.start().catch(error => {
          const startError = new Error(
            `Failed to restart Python process: ${error.message}`
          )
          startError.name = 'PythonRestartFailed'
          this.emit('error', startError)
        })
      }, this.restartDelay * this.restartAttempts)
    } else {
      const maxRestartsError = new Error(
        `Python process exceeded maximum restart attempts (${this.maxRestartAttempts})`
      )
      maxRestartsError.name = 'PythonMaxRestartsExceeded'
      console.error(`[PythonManager] ${maxRestartsError.message}`)
      this.emit('max-restarts-exceeded', maxRestartsError)
    }
  }

  /**
   * Procesa datos recibidos desde stdout del proceso Python
   *
   * Este método implementa la recepción y correlación de respuestas:
   * 1. Acumula datos en stdoutBuffer hasta encontrar newlines
   * 2. Procesa cada línea completa:
   *    - Detecta señal "READY" para marcar el proceso como listo
   *    - Parsea líneas JSON como responses
   *    - Valida el schema con Zod
   *    - Correlaciona por ID con pendingRequests
   *    - Resuelve o rechaza la Promise correspondiente
   *
   * @param data - Datos recibidos desde stdout (puede contener múltiples líneas)
   *
   * @private
   */
  private handleStdout(data: string): void {
    console.log('[PythonManager] Received stdout:', JSON.stringify(data))
    this.stdoutBuffer += data
    const lines = this.stdoutBuffer.split('\n')

    // Keep the last incomplete line in the buffer
    this.stdoutBuffer = lines.pop() || ''

    for (const line of lines) {
      if (line.trim() === '') continue

      // Check for READY signal
      if (line.trim() === 'READY') {
        console.log('[PythonManager] READY signal detected')
        this.ready = true
        this.emit('ready')
        continue
      }

      // Skip non-JSON lines
      if (!line.trim().startsWith('{')) continue

      try {
        const parsed = JSON.parse(line)
        const response = PythonResponseSchema.parse(parsed)
        const id = response.id

        if (this.pendingRequests.has(id)) {
          const pending = this.pendingRequests.get(id)!
          clearTimeout(pending.timeout)
          this.pendingRequests.delete(id)

          if ('error' in response && response.error) {
            const error = new Error(response.error)
            error.name = 'PythonServerError'
            pending.reject(error)
          } else {
            // Extract result from response
            const result = response.result ?? response
            pending.resolve(result)
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        const errorDetails = {
          line: line.substring(0, 200), // Truncate long lines
          parseError: errorMessage,
          timestamp: new Date().toISOString()
        }

        this.emit(
          'error',
          new Error(`Failed to parse Python response: ${errorMessage}`)
        )

        // Log detailed error for debugging
        console.error('[PythonManager] Parse error details:', errorDetails)
      }
    }
  }

  /**
   * Envía un request al proceso Python y espera la respuesta
   *
   * Este método implementa el protocolo de comunicación IPC:
   * 1. Genera un ID único para el request
   * 2. Crea una Promise y la guarda en pendingRequests con el ID
   * 3. Serializa el request a JSON y lo escribe en stdin
   * 4. Configura un timeout para rechazar la Promise si no hay respuesta
   * 5. Cuando llega la respuesta en stdout, handleStdout() correlaciona por ID
   *    y resuelve/rechaza la Promise correspondiente
   *
   * @param method - Nombre del método a ejecutar en Python (ej: 'load_model', 'get_embedding')
   * @param args - Argumentos para el método (se serializan como array JSON)
   * @returns Promise con el resultado del método Python
   * @throws Error si el proceso Python no está listo
   * @throws Error si el request timeout (30s por defecto)
   * @throws Error si falla la escritura en stdin
   *
   * @example
   * ```typescript
   * // Cargar modelo
   * await manager.call('load_model', 'my-model', {
   *   type: 'dlib',
   *   path: 'models/dlib/dlib_face_recognition_resnet_model_v1.dat'
   * })
   *
   * // Obtener embedding
   * const embedding = await manager.call('get_embedding', imageBase64, 'my-model')
   * ```
   */
  async call(method: string, ...args: unknown[]): Promise<unknown> {
    if (!this.process || !this.ready) {
      throw new Error('Python process not ready')
    }

    const id = ++this.requestId
    const request: PythonRequest = { id, method, args }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const pending = this.pendingRequests.get(id)
        if (pending) {
          this.pendingRequests.delete(id)
          const error = new Error(
            `Request timeout after ${this.defaultTimeout}ms for method: ${method}`
          )
          error.name = 'PythonRequestTimeout'
          this.emit('error', error)
          pending.reject(error)
        }
      }, this.defaultTimeout)

      this.pendingRequests.set(id, { resolve, reject, timeout, method })

      const json = JSON.stringify(request) + '\n'
      this.process!.stdin!.write(json, error => {
        if (error) {
          clearTimeout(timeout)
          this.pendingRequests.delete(id)
          const writeError = new Error(
            `Failed to write to Python process stdin: ${error.message}`
          )
          writeError.name = 'PythonWriteError'
          this.emit('error', writeError)
          reject(writeError)
        }
      })
    })
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

    this.process.stdout!.on('data', data => {
      callback(data.toString())
    })
  }
}
