import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolve } from 'node:path'
import { unlinkSync, existsSync } from 'node:fs'
import { BenchmarkStorage } from '../src/services/benchmark/storage'
import type { BenchmarkResult } from '../src/services/benchmark/runner'

const TEST_DB = resolve(process.cwd(), 'data/test-benchmarks.db')

function makeResult(overrides: Partial<BenchmarkResult> = {}): BenchmarkResult {
  return {
    dataset: 'lfw',
    model: 'insightface-buffalo-l',
    timestamp: new Date().toISOString(),
    accuracy: {
      tarAtFar001: 0.99,
      tarAtFar01: 0.995,
      tarAtFar1: 0.999,
      eer: 0.01,
      auc: 0.998,
      rocPoints: [
        { far: 0, tpr: 0 },
        { far: 0.001, tpr: 0.99 },
        { far: 1, tpr: 1 }
      ]
    },
    performance: {
      avgLatency: 20.5,
      totalTime: 123000,
      pairsProcessed: 6000
    },
    ...overrides
  }
}

describe('BenchmarkStorage', () => {
  let storage: BenchmarkStorage

  beforeEach(() => {
    storage = new BenchmarkStorage(TEST_DB)
  })

  afterEach(() => {
    storage.close()
    if (existsSync(TEST_DB)) {
      unlinkSync(TEST_DB)
    }
  })

  describe('saveResult', () => {
    it('should save a benchmark result', () => {
      const result = makeResult()
      const id = storage.saveResult(result)

      expect(id).toBeGreaterThan(0)
    })

    it('should save multiple results with incrementing IDs', () => {
      const id1 = storage.saveResult(makeResult())
      const id2 = storage.saveResult(makeResult())

      expect(id2).toBeGreaterThan(id1)
    })
  })

  describe('getHistory', () => {
    it('should return empty array when no results', () => {
      const history = storage.getHistory()
      expect(history).toEqual([])
    })

    it('should return saved results ordered by timestamp descending', () => {
      storage.saveResult(makeResult({ model: 'model-a' }))
      storage.saveResult(makeResult({ model: 'model-b' }))

      const history = storage.getHistory()
      expect(history).toHaveLength(2)
    })

    it('should filter by model', () => {
      storage.saveResult(makeResult({ model: 'model-a' }))
      storage.saveResult(makeResult({ model: 'model-b' }))

      const history = storage.getHistory({ model: 'model-a' })
      expect(history).toHaveLength(1)
      expect(history[0].model).toBe('model-a')
    })

    it('should filter by dataset', () => {
      storage.saveResult(makeResult({ dataset: 'lfw' }))
      storage.saveResult(makeResult({ dataset: 'cfp-fp' }))

      const history = storage.getHistory({ dataset: 'lfw' })
      expect(history).toHaveLength(1)
      expect(history[0].dataset).toBe('lfw')
    })

    it('should limit results', () => {
      storage.saveResult(makeResult({ model: 'model-a' }))
      storage.saveResult(makeResult({ model: 'model-b' }))
      storage.saveResult(makeResult({ model: 'model-c' }))

      const history = storage.getHistory({ limit: 2 })
      expect(history).toHaveLength(2)
    })
  })

  describe('getLeaderboard', () => {
    it('should return best run per model per dataset', () => {
      storage.saveResult(
        makeResult({
          model: 'model-a',
          dataset: 'lfw',
          accuracy: { ...makeResult().accuracy, auc: 0.99 }
        })
      )
      storage.saveResult(
        makeResult({
          model: 'model-a',
          dataset: 'lfw',
          accuracy: { ...makeResult().accuracy, auc: 0.95 }
        })
      )
      storage.saveResult(
        makeResult({
          model: 'model-b',
          dataset: 'lfw',
          accuracy: { ...makeResult().accuracy, auc: 0.98 }
        })
      )

      const leaderboard = storage.getLeaderboard()
      expect(leaderboard).toHaveLength(2)

      // model-a should show its best (0.99), model-b shows 0.98
      const modelA = leaderboard.find(e => e.model === 'model-a')
      const modelB = leaderboard.find(e => e.model === 'model-b')
      expect(modelA?.auc).toBe(0.99)
      expect(modelB?.auc).toBe(0.98)
    })

    it('should sort by AUC descending', () => {
      storage.saveResult(
        makeResult({
          model: 'model-a',
          accuracy: { ...makeResult().accuracy, auc: 0.9 }
        })
      )
      storage.saveResult(
        makeResult({
          model: 'model-b',
          accuracy: { ...makeResult().accuracy, auc: 0.95 }
        })
      )

      const leaderboard = storage.getLeaderboard()
      expect(leaderboard[0].auc).toBeGreaterThanOrEqual(leaderboard[1].auc)
    })

    it('should limit results', () => {
      storage.saveResult(makeResult({ model: 'model-a' }))
      storage.saveResult(makeResult({ model: 'model-b' }))
      storage.saveResult(makeResult({ model: 'model-c' }))

      const leaderboard = storage.getLeaderboard({ limit: 2 })
      expect(leaderboard).toHaveLength(2)
    })
  })

  describe('close', () => {
    it('should not throw when closing', () => {
      expect(() => storage.close()).not.toThrow()
    })
  })
})
