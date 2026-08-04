import { describe, it, expect, vi } from 'vitest'
import { runBenchmark } from '../src/services/benchmark/runner'

describe('Benchmark Runner', () => {
  it('should throw if no models specified', async () => {
    const compareFn = vi.fn()
    await expect(
      runBenchmark({ dataset: 'lfw', models: [] }, compareFn)
    ).rejects.toThrow('At least one model')
  })

  it('should throw for unknown dataset', async () => {
    const compareFn = vi.fn()
    await expect(
      runBenchmark({ dataset: 'invalid', models: ['model-a'] }, compareFn)
    ).rejects.toThrow('Unknown dataset')
  })

  it('should run benchmark for one model', async () => {
    const compareFn = vi.fn().mockResolvedValue({
      similarity: 0.9,
      latency: 10
    })

    // LFW: first 150 pairs per folder are "same", rest "different"
    // Use 160 to ensure both labels appear
    const results = await runBenchmark(
      { dataset: 'lfw', models: ['model-a'], maxPairs: 160 },
      compareFn
    )

    expect(results).toHaveLength(1)
    expect(results[0].model).toBe('model-a')
    expect(results[0].dataset).toBe('lfw')
    expect(results[0].performance.pairsProcessed).toBe(160)
    expect(results[0].performance.avgLatency).toBe(10)
    expect(results[0].accuracy.rocPoints.length).toBeGreaterThan(0)
    expect(results[0].accuracy.auc).toBeGreaterThan(0)
  })

  it('should run benchmark for multiple models', async () => {
    const compareFn = vi.fn().mockResolvedValue({
      similarity: 0.9,
      latency: 10
    })

    const results = await runBenchmark(
      { dataset: 'lfw', models: ['model-a', 'model-b'], maxPairs: 160 },
      compareFn
    )

    expect(results).toHaveLength(2)
    expect(results[0].model).toBe('model-a')
    expect(results[1].model).toBe('model-b')
  })

  it('should calculate metrics with both same and different labels', async () => {
    let pairIndex = 0
    const compareFn = vi.fn().mockImplementation(async () => {
      pairIndex++
      const similarity = pairIndex <= 150 ? 0.9 : 0.1
      return { similarity, latency: 5 }
    })

    const results = await runBenchmark(
      { dataset: 'lfw', models: ['test-model'], maxPairs: 300 },
      compareFn
    )

    expect(results[0].accuracy.auc).toBeGreaterThan(0.5)
    expect(results[0].performance.pairsProcessed).toBe(300)
  })

  it('should track performance metrics', async () => {
    const compareFn = vi.fn().mockResolvedValue({
      similarity: 0.5,
      latency: 20
    })

    const results = await runBenchmark(
      { dataset: 'lfw', models: ['perf-model'], maxPairs: 160 },
      compareFn
    )

    expect(results[0].performance.pairsProcessed).toBe(160)
    expect(results[0].performance.avgLatency).toBe(20)
    expect(results[0].performance.totalTime).toBeGreaterThan(0)
  })

  it('should include valid timestamp', async () => {
    const compareFn = vi.fn().mockResolvedValue({
      similarity: 0.5,
      latency: 10
    })

    const results = await runBenchmark(
      { dataset: 'lfw', models: ['model-a'], maxPairs: 160 },
      compareFn
    )

    expect(results[0].timestamp).toBeDefined()
    expect(new Date(results[0].timestamp).toISOString()).toBe(
      results[0].timestamp
    )
  })
})
