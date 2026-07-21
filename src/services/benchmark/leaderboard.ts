import type { LeaderboardEntry } from './storage'

export interface LeaderboardOptions {
  /** Filter by dataset name (e.g. 'lfw', 'cfp-fp') */
  dataset?: string
  /** Sort field. Defaults to 'auc' */
  sortBy?: 'auc' | 'eer' | 'avgLatency' | 'tarAtFar001'
  /** Sort direction. Defaults to 'desc' (higher is better) */
  sortDir?: 'asc' | 'desc'
  /** Max entries to include */
  limit?: number
}

/** Supported export formats */
export type ExportFormat = 'json' | 'csv' | 'markdown'

/**
 * Generates a leaderboard from benchmark results and exports in the requested format
 *
 * @param entries - Array of leaderboard entries from BenchmarkStorage
 * @param options - Formatting and filtering options
 * @param format - Export format (json, csv, markdown)
 * @returns Formatted leaderboard as string
 */
export function generateLeaderboard(
  entries: LeaderboardEntry[],
  options?: LeaderboardOptions,
  format: ExportFormat = 'markdown'
): string {
  let filtered = [...entries]

  // Filter by dataset
  if (options?.dataset) {
    filtered = filtered.filter(e => e.dataset === options.dataset)
  }

  // Sort
  const sortBy = options?.sortBy ?? 'auc'
  const sortDir = options?.sortDir ?? 'desc'
  const multiplier = sortDir === 'desc' ? -1 : 1

  filtered.sort((a, b) => {
    const aVal = a[sortBy]
    const bVal = b[sortBy]
    return (aVal - bVal) * multiplier
  })

  // Limit
  if (options?.limit) {
    filtered = filtered.slice(0, options.limit)
  }

  switch (format) {
    case 'json':
      return formatJson(filtered)
    case 'csv':
      return formatCsv(filtered)
    case 'markdown':
      return formatMarkdown(filtered)
    default:
      return formatMarkdown(filtered)
  }
}

/**
 * Formats entries as pretty-printed JSON
 */
function formatJson(entries: LeaderboardEntry[]): string {
  return JSON.stringify(entries, null, 2)
}

/**
 * Formats entries as CSV with header row
 *
 * Columns: model, dataset, auc, eer, tarAtFar001, avgLatency, pairsProcessed, timestamp
 */
function formatCsv(entries: LeaderboardEntry[]): string {
  const header =
    'model,dataset,auc,eer,tarAtFar001,avgLatency,pairsProcessed,timestamp'
  const rows = entries.map(e =>
    [
      e.model,
      e.dataset,
      e.auc.toFixed(6),
      e.eer.toFixed(6),
      e.tarAtFar001.toFixed(6),
      e.avgLatency.toFixed(2),
      e.pairsProcessed,
      e.timestamp
    ].join(',')
  )

  return [header, ...rows].join('\n')
}

/**
 * Formats entries as a Markdown table
 *
 * Columns: #, Model, Dataset, AUC, EER, TAR@FAR=0.001, Avg Latency, Pairs
 */
function formatMarkdown(entries: LeaderboardEntry[]): string {
  const header =
    '| # | Model | Dataset | AUC | EER | TAR@FAR=0.001 | Avg Latency | Pairs |'
  const separator =
    '|---|-------|---------|-----|-----|---------------|-------------|-------|'

  const rows = entries.map((e, i) =>
    [
      `| ${i + 1}`,
      e.model,
      e.dataset,
      e.auc.toFixed(4),
      e.eer.toFixed(4),
      e.tarAtFar001.toFixed(4),
      `${e.avgLatency.toFixed(1)}ms`,
      e.pairsProcessed,
      '|'
    ].join(' | ')
  )

  return [header, separator, ...rows].join('\n')
}
