import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { BenchmarkResult } from './runner'

const DATA_DIR = resolve(process.cwd(), 'data')

export interface LeaderboardEntry {
  model: string
  dataset: string
  timestamp: string
  auc: number
  eer: number
  tarAtFar001: number
  avgLatency: number
  pairsProcessed: number
}

export interface HistoryQuery {
  model?: string
  dataset?: string
  limit?: number
}

export interface ModelStats {
  model: string
  dataset: string
  aucMean: number
  aucStd: number
  eerMean: number
  eerStd: number
  latMean: number
  latStd: number
  n: number
}

/**
 * SQLite-backed storage for benchmark results
 */
export class BenchmarkStorage {
  private db: DatabaseSync
  private closed = false

  constructor(dbPath?: string) {
    const path = dbPath ?? resolve(DATA_DIR, 'benchmarks.db')

    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true })
    }

    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.migrate()
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.db.close()
  }

  /**
   * Saves benchmark results to the database
   *
   * Stores the run summary with accuracy and performance metrics.
   *
   * @param result - Benchmark result from runBenchmark()
   * @param repeatIndex - Repeat number for confidence intervals (default: 0)
   * @returns The run ID
   */
  saveResult(result: BenchmarkResult, repeatIndex = 0): number {
    const stmt = this.db.prepare(`
      INSERT INTO benchmark_runs
        (dataset, model, timestamp, avg_latency, total_time, pairs_processed,
         tar_at_far_001, tar_at_far_01, tar_at_far_1, eer, auc, roc_points, repeat_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const info = stmt.run(
      result.dataset,
      result.model,
      result.timestamp,
      result.performance.avgLatency,
      result.performance.totalTime,
      result.performance.pairsProcessed,
      result.accuracy.tarAtFar001,
      result.accuracy.tarAtFar01,
      result.accuracy.tarAtFar1,
      result.accuracy.eer,
      result.accuracy.auc,
      JSON.stringify(result.accuracy.rocPoints),
      repeatIndex
    )

    return Number(info.lastInsertRowid)
  }

  /**
   * Gets historical benchmark results with optional filters
   *
   * @param options - Optional filters (model, dataset, limit)
   * @returns Array of leaderboard entries sorted by timestamp descending
   */
  getHistory(options?: HistoryQuery): LeaderboardEntry[] {
    let query = `
      SELECT
        model, dataset, timestamp, auc, eer,
        tar_at_far_001 AS tarAtFar001,
        avg_latency AS avgLatency,
        pairs_processed AS pairsProcessed
      FROM benchmark_runs
      WHERE 1=1
    `
    const params: (string | number)[] = []

    if (options?.model) {
      query += ' AND model = ?'
      params.push(options.model)
    }

    if (options?.dataset) {
      query += ' AND dataset = ?'
      params.push(options.dataset)
    }

    query += ' ORDER BY timestamp DESC'

    if (options?.limit) {
      query += ' LIMIT ?'
      params.push(options.limit)
    }

    return this.db
      .prepare(query)
      .all(...params) as unknown as LeaderboardEntry[]
  }

  /**
   * Gets the leaderboard showing best model per dataset
   *
   * For each dataset+model combination, returns the run with the highest AUC.
   *
   * @param options - Optional filters (limit)
   * @returns Array of leaderboard entries sorted by AUC descending
   */
  getLeaderboard(options?: { limit?: number }): LeaderboardEntry[] {
    let query = `
      SELECT
        r.model, r.dataset, r.timestamp, r.auc, r.eer,
        r.tar_at_far_001 AS tarAtFar001,
        r.avg_latency AS avgLatency,
        r.pairs_processed AS pairsProcessed
      FROM benchmark_runs r
      INNER JOIN (
        SELECT model, dataset, MAX(auc) AS max_auc
        FROM benchmark_runs
        GROUP BY model, dataset
      ) best
        ON r.model = best.model
        AND r.dataset = best.dataset
        AND r.auc = best.max_auc
      ORDER BY r.auc DESC
    `

    if (options?.limit) {
      query += ' LIMIT ?'
      return this.db
        .prepare(query)
        .all(options.limit) as unknown as LeaderboardEntry[]
    }

    return this.db.prepare(query).all() as unknown as LeaderboardEntry[]
  }

  /**
   * Gets mean and standard deviation statistics for repeated runs
   *
   * @param model - Model name to filter (optional)
   * @param dataset - Dataset name to filter (optional)
   * @returns Array of per-model stats with mean and std
   */
  getStats(model?: string, dataset?: string): ModelStats[] {
    let query = `
      SELECT model, dataset,
             AVG(auc) AS auc_mean,
             AVG(eer) AS eer_mean,
             AVG(avg_latency) AS lat_mean,
             COUNT(*) AS n
      FROM benchmark_runs
      WHERE 1=1
    `
    const params: (string | number)[] = []

    if (model) {
      query += ' AND model = ?'
      params.push(model)
    }
    if (dataset) {
      query += ' AND dataset = ?'
      params.push(dataset)
    }

    query += ' GROUP BY model, dataset ORDER BY auc_mean DESC'

    const agg = this.db.prepare(query).all(...params) as {
      model: string
      dataset: string
      auc_mean: number
      eer_mean: number
      lat_mean: number
      n: number
    }[]

    // Compute std for each group
    const result: ModelStats[] = []
    for (const row of agg) {
      let aucStd = 0
      let eerStd = 0
      let latStd = 0

      if (row.n > 1) {
        const details = this.db
          .prepare(
            'SELECT auc, eer, avg_latency FROM benchmark_runs WHERE model = ? AND dataset = ?'
          )
          .all(row.model, row.dataset) as {
          auc: number
          eer: number
          avg_latency: number
        }[]

        const aucs = details.map(d => d.auc)
        const eers = details.map(d => d.eer)
        const lats = details.map(d => d.avg_latency)

        aucStd = Math.sqrt(
          aucs.reduce((s, v) => s + (v - row.auc_mean) ** 2, 0) / row.n
        )
        eerStd = Math.sqrt(
          eers.reduce((s, v) => s + (v - row.eer_mean) ** 2, 0) / row.n
        )
        latStd = Math.sqrt(
          lats.reduce((s, v) => s + (v - row.lat_mean) ** 2, 0) / row.n
        )
      }

      result.push({
        model: row.model,
        dataset: row.dataset,
        aucMean: row.auc_mean,
        aucStd,
        eerMean: row.eer_mean,
        eerStd,
        latMean: row.lat_mean,
        latStd,
        n: row.n
      })
    }

    return result
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS benchmark_runs (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        dataset       TEXT NOT NULL,
        model         TEXT NOT NULL,
        timestamp     TEXT NOT NULL,
        avg_latency   REAL NOT NULL,
        total_time    REAL NOT NULL,
        pairs_processed INTEGER NOT NULL,
        tar_at_far_001 REAL NOT NULL,
        tar_at_far_01  REAL NOT NULL,
        tar_at_far_1   REAL NOT NULL,
        eer           REAL NOT NULL,
        auc           REAL NOT NULL,
        roc_points    TEXT NOT NULL,
        repeat_index  INTEGER DEFAULT 0,
        created_at    TEXT DEFAULT (datetime('now'))
      )
    `)

    // Add repeat_index column to existing databases (idempotent)
    try {
      this.db.exec(
        'ALTER TABLE benchmark_runs ADD COLUMN repeat_index INTEGER DEFAULT 0'
      )
    } catch {
      // Column already exists - ignore
    }

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_runs_model
        ON benchmark_runs(model)
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_runs_dataset
        ON benchmark_runs(dataset)
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_runs_timestamp
        ON benchmark_runs(timestamp)
    `)
  }
}
