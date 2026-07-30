import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadDataset } from './dataset-loader'
import { type AccuracyMetrics, calculateAllMetrics } from './metrics'

/**
 * Configuration for a benchmark run
 */
export interface BenchmarkOptions {
  /** Dataset name (lfw, cfp-fp, agedb-30, calfw) */
  dataset: string
  /** Model names to benchmark (one result per model, runs sequentially) */
  models: string[]
  /**
   * Limit pairs per model for quick test
   * @default all pairs in the dataset
   */
  maxPairs?: number
  /**
   * Number of times to repeat the benchmark for confidence intervals
   * @default 1
   */
  repeats?: number
}

/**
 * Performance metrics from a benchmark run
 */
export interface ModelPerformance {
  /** Average time per pair comparison in ms */
  avgLatency: number
  /** Total wall-clock time for all pairs in ms */
  totalTime: number
  /** Number of pairs processed */
  pairsProcessed: number
}

/**
 * Complete result of a single model benchmark
 */
export interface BenchmarkResult {
  /** Dataset name */
  dataset: string
  /** Model name */
  model: string
  /** ISO timestamp of when the benchmark ran */
  timestamp: string
  /** Accuracy metrics (ROC, TAR@FAR, EER, AUC) */
  accuracy: AccuracyMetrics
  /** Performance metrics (latency, throughput) */
  performance: ModelPerformance
}

/**
 * Function type for comparing two face images
 *
 * Typically wraps FaceRecognitionService.compare() to decouple
 * the benchmark runner from the service implementation.
 *
 * @param image1 - First face image buffer
 * @param image2 - Second face image buffer
 * @param model - Model name to use for comparison
 * @returns Similarity score (-1 to 1) and latency in ms
 */
export type CompareFn = (
  image1: Buffer,
  image2: Buffer,
  model: string
) => Promise<{
  similarity: number
  latency: number
}>

/**
 * Runs a benchmark for one or more models against a dataset
 *
 * @param options - Benchmark configuration
 * @param compareFn - Function to compare two images (typically FaceRecognitionService.compare)
 * @returns Array of benchmark results, one per model
 */
export async function runBenchmark(
  options: BenchmarkOptions,
  compareFn: CompareFn
): Promise<BenchmarkResult[]> {
  const { dataset: datasetName, models, maxPairs, repeats } = options

  if (models.length === 0) {
    throw new Error('At least one model must be specified')
  }

  // Load dataset
  const dataset = loadDataset(datasetName, true)
  const pairs = maxPairs ? dataset.pairs.slice(0, maxPairs) : dataset.pairs

  if (pairs.length === 0) {
    throw new Error(`Dataset "${datasetName}" has no pairs`)
  }

  const results: BenchmarkResult[] = []
  const numRepeats = repeats ?? 1

  for (const model of models) {
    for (let r = 1; r <= numRepeats; r++) {
      if (numRepeats > 1) {
        console.log(
          `[Benchmark] ${model} on ${datasetName} (repeat ${r}/${numRepeats})...`
        )
      }

      const modelResult = await benchmarkModel(
        datasetName,
        model,
        dataset.rootDir,
        pairs,
        compareFn
      )

      if (numRepeats > 1) {
        // Tag result with repeat info for storage
        ;(
          modelResult as BenchmarkResult & { repeatIndex?: number }
        ).repeatIndex = r
      }

      results.push(modelResult)
    }
  }

  return results
}

/**
 * Runs comparisons for a single model against all pairs and computes metrics
 *
 * Reads each image pair from disk, calls compareFn, collects similarities and
 * latencies, then calculates accuracy and performance metrics.
 */
async function benchmarkModel(
  datasetName: string,
  model: string,
  rootDir: string,
  pairs: { image1: string; image2: string; label: number }[],
  compareFn: CompareFn
): Promise<BenchmarkResult> {
  const similarities: number[] = []
  const labels: number[] = []
  const latencies: number[] = []

  const startTime = performance.now()

  for (const pair of pairs) {
    const path1 = resolve(rootDir, pair.image1)
    const path2 = resolve(rootDir, pair.image2)

    try {
      const img1 = readFileSync(path1)
      const img2 = readFileSync(path2)

      const result = await compareFn(img1, img2, model)

      similarities.push(result.similarity)
      labels.push(pair.label)
      latencies.push(result.latency)
    } catch (error) {
      // Skip failed pair gracefully
      console.warn(
        `[Benchmark] Skipping pair: ${pair.image1} vs ${pair.image2}: ${error instanceof Error ? error.message.slice(0, 80) : String(error)}`
      )
    }
  }

  const totalTime = performance.now() - startTime
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length

  const accuracy = calculateAllMetrics(similarities, labels)

  return {
    dataset: datasetName,
    model,
    timestamp: new Date().toISOString(),
    accuracy,
    performance: {
      avgLatency,
      totalTime,
      pairsProcessed: pairs.length
    }
  }
}
