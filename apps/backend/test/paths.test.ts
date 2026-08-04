import { existsSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  backendRoot,
  dataDir,
  datasetsDir,
  envFilePath,
  getEnvFilePath,
  getMetricsDir,
  getModelsDir,
  getPythonBin,
  metricsDir,
  modelsDir,
  pythonBin,
  pythonServerScript,
  repoRoot,
  resolveMetricsPath,
  resolveModelPath
} from '../src/config/paths'
import { PythonManager } from '../src/services/face-recognition/python-manager'

describe('paths (D2)', () => {
  const saved: Record<string, string | undefined> = {}

  const setEnv = (key: string, value: string | undefined) => {
    saved[key] = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  beforeEach(() => {
    setEnv('MODELS_DIR', undefined)
    setEnv('METRICS_DIR', undefined)
    setEnv('PYTHON_BIN', undefined)
    setEnv('DOORCLOUD_ENV_FILE', undefined)
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('resolves backendRoot to the apps/backend directory', () => {
    expect(basename(backendRoot)).toBe('backend')
    expect(basename(dirname(backendRoot))).toBe('apps')
  })

  it('resolves repoRoot to the monorepo root', () => {
    expect(basename(repoRoot)).toBe('DoorCloud-backend')
    expect(existsSync(resolve(repoRoot, 'pnpm-workspace.yaml'))).toBe(true)
  })

  it('places data, .env, python script and models under backendRoot', () => {
    expect(dataDir).toBe(resolve(backendRoot, 'data'))
    expect(envFilePath).toBe(resolve(backendRoot, '.env'))
    expect(pythonServerScript).toBe(
      resolve(backendRoot, 'scripts/face_recognition_server.py')
    )
    expect(modelsDir).toBe(resolve(backendRoot, 'models'))
  })

  it('places metrics and datasets at the repo root', () => {
    expect(metricsDir).toBe(resolve(repoRoot, 'metrics'))
    expect(datasetsDir).toBe(resolve(repoRoot, 'datasets'))
  })

  it('defaults the python binary to the repo .venv', () => {
    expect(pythonBin).toBe(resolve(repoRoot, '.venv/bin/python3'))
  })

  it('honors MODELS_DIR, METRICS_DIR, PYTHON_BIN and DOORCLOUD_ENV_FILE', () => {
    setEnv('MODELS_DIR', '/tmp/models')
    setEnv('METRICS_DIR', '/tmp/metrics')
    setEnv('PYTHON_BIN', '/usr/bin/python3')
    setEnv('DOORCLOUD_ENV_FILE', '/tmp/doorcloud.env')

    expect(getModelsDir()).toBe('/tmp/models')
    expect(getMetricsDir()).toBe('/tmp/metrics')
    expect(getPythonBin()).toBe('/usr/bin/python3')
    expect(getEnvFilePath()).toBe('/tmp/doorcloud.env')
  })

  it('resolves model paths under modelsDir, stripping the models/ prefix', () => {
    expect(resolveModelPath('models/insightface/det_500m.onnx')).toBe(
      resolve(getModelsDir(), 'insightface/det_500m.onnx')
    )
    expect(resolveModelPath('insightface/det_500m.onnx')).toBe(
      resolve(getModelsDir(), 'insightface/det_500m.onnx')
    )
  })

  it('resolves metric paths under metricsDir', () => {
    expect(resolveMetricsPath('matchPhoto.csv')).toBe(
      resolve(getMetricsDir(), 'matchPhoto.csv')
    )
  })

  it('ships the python IPC server script with the backend', () => {
    expect(existsSync(pythonServerScript)).toBe(true)
  })

  it('fails loudly when the python server script is missing', async () => {
    const manager = new PythonManager()
    ;(manager as unknown as { scriptPath: string }).scriptPath = resolve(
      backendRoot,
      'scripts/missing-server.py'
    )

    await expect(manager.start()).rejects.toThrow(/not found/i)
  })
})
