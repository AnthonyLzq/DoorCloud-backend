import { describe, it, expect } from 'vitest'
import { generateLeaderboard } from '../src/services/benchmark/leaderboard'
import type { LeaderboardEntry } from '../src/services/benchmark/storage'

const MOCK_ENTRIES: LeaderboardEntry[] = [
  {
    model: 'buffalo-l',
    dataset: 'lfw',
    timestamp: '2026-07-21T12:00:00.000Z',
    auc: 0.998,
    eer: 0.012,
    tarAtFar001: 0.992,
    avgLatency: 20.5,
    pairsProcessed: 6000
  },
  {
    model: 'dlib',
    dataset: 'lfw',
    timestamp: '2026-07-21T12:00:00.000Z',
    auc: 0.95,
    eer: 0.05,
    tarAtFar001: 0.85,
    avgLatency: 45.2,
    pairsProcessed: 6000
  },
  {
    model: 'buffalo-l',
    dataset: 'cfp-fp',
    timestamp: '2026-07-21T12:00:00.000Z',
    auc: 0.99,
    eer: 0.018,
    tarAtFar001: 0.97,
    avgLatency: 22.1,
    pairsProcessed: 7000
  }
]

describe('Leaderboard Generation', () => {
  describe('filtering', () => {
    it('should return all entries when no options', () => {
      const result = generateLeaderboard(MOCK_ENTRIES)
      expect(result).toBeTruthy()
    })

    it('should filter by dataset', () => {
      const result = generateLeaderboard(
        MOCK_ENTRIES,
        { dataset: 'lfw' },
        'json'
      )
      const parsed = JSON.parse(result)
      expect(parsed).toHaveLength(2)
      expect(parsed.every((e: LeaderboardEntry) => e.dataset === 'lfw')).toBe(
        true
      )
    })

    it('should filter by dataset with no matches', () => {
      const result = generateLeaderboard(
        MOCK_ENTRIES,
        { dataset: 'agedb-30' },
        'json'
      )
      expect(JSON.parse(result)).toHaveLength(0)
    })
  })

  describe('sorting', () => {
    it('should sort by AUC descending by default', () => {
      const result = generateLeaderboard(MOCK_ENTRIES, {}, 'json')
      const parsed = JSON.parse(result)
      expect(parsed[0].auc).toBe(0.998)
      expect(parsed[parsed.length - 1].auc).toBe(0.95)
    })

    it('should sort by latency ascending', () => {
      const result = generateLeaderboard(
        MOCK_ENTRIES,
        { sortBy: 'avgLatency', sortDir: 'asc' },
        'json'
      )
      const parsed = JSON.parse(result)
      expect(parsed[0].avgLatency).toBe(20.5)
      expect(parsed[parsed.length - 1].avgLatency).toBe(45.2)
    })

    it('should sort by EER ascending', () => {
      const result = generateLeaderboard(
        MOCK_ENTRIES,
        { sortBy: 'eer', sortDir: 'asc' },
        'json'
      )
      const parsed = JSON.parse(result)
      expect(parsed[0].eer).toBe(0.012)
    })
  })

  describe('limiting', () => {
    it('should limit results', () => {
      const result = generateLeaderboard(MOCK_ENTRIES, { limit: 2 }, 'json')
      expect(JSON.parse(result)).toHaveLength(2)
    })
  })

  describe('export formats', () => {
    it('should export to JSON', () => {
      const result = generateLeaderboard(MOCK_ENTRIES, {}, 'json')
      const parsed = JSON.parse(result)
      expect(parsed).toHaveLength(3)
      expect(parsed[0].model).toBe('buffalo-l')
    })

    it('should export to CSV with header', () => {
      const result = generateLeaderboard(MOCK_ENTRIES, {}, 'csv')
      const lines = result.trim().split('\n')
      expect(lines[0]).toBe(
        'model,dataset,auc,eer,tarAtFar001,avgLatency,pairsProcessed,timestamp'
      )
      expect(lines).toHaveLength(4) // header + 3 rows
    })

    it('should export to Markdown with table format', () => {
      const result = generateLeaderboard(MOCK_ENTRIES, {}, 'markdown')
      expect(result).toContain('| # | Model | Dataset | AUC')
      expect(result).toContain('buffalo-l')
      expect(result).toContain('|---|')
    })
  })
})
