import { dirname, resolve } from 'node:path'

/**
 * Module-relative runtime paths (D2).
 *
 * The backend must not depend on the current working directory: pnpm runs
 * package scripts from `apps/backend`, but a user may start `dist/index.js`
 * from anywhere. Every runtime path is derived from this module's own
 * location so the Python IPC server, ONNX models, SQLite state, `.env` and
 * the benchmark metrics CSV all resolve deterministically.
 *
 * Env overrides: PYTHON_BIN, MODELS_DIR, METRICS_DIR and DOORCLOUD_ENV_FILE
 * (the last one primarily for test isolation of the setup page writer).
 */

// __dirname = <repo>/apps/backend/src/config (dev) or <repo>/apps/backend/dist/config (built)
const moduleDir = dirname(__dirname)

export const backendRoot = resolve(moduleDir, '..')
export const repoRoot = resolve(backendRoot, '..', '..')

export const dataDir = resolve(backendRoot, 'data')
export const datasetsDir = resolve(repoRoot, 'datasets')
export const pythonServerScript = resolve(
  backendRoot,
  'scripts/face_recognition_server.py'
)

const defaultModelsDir = resolve(backendRoot, 'models')
const defaultMetricsDir = resolve(repoRoot, 'metrics')
const defaultPythonBin = resolve(repoRoot, '.venv/bin/python3')
const defaultEnvFilePath = resolve(backendRoot, '.env')

export const modelsDir = defaultModelsDir
export const metricsDir = defaultMetricsDir
export const pythonBin = defaultPythonBin
export const envFilePath = defaultEnvFilePath

export const getModelsDir = (): string =>
  process.env.MODELS_DIR ?? defaultModelsDir
export const getMetricsDir = (): string =>
  process.env.METRICS_DIR ?? defaultMetricsDir
export const getPythonBin = (): string =>
  process.env.PYTHON_BIN ?? defaultPythonBin
export const getEnvFilePath = (): string =>
  process.env.DOORCLOUD_ENV_FILE ?? defaultEnvFilePath

/**
 * Resolves a model path under MODELS_DIR.
 *
 * Callers pass paths like `models/insightface/det_500m.onnx` (they always
 * carried the legacy `models/` prefix); the prefix is stripped so the file
 * lands directly under MODELS_DIR.
 */
export const resolveModelPath = (modelPath: string): string =>
  resolve(getModelsDir(), modelPath.replace(/^models[\\/]/, ''))

export const resolveMetricsPath = (metricPath: string): string =>
  resolve(getMetricsDir(), metricPath)
