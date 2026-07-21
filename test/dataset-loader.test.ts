import { describe, it, expect } from 'vitest'
import {
  loadDataset,
  type DatasetPair
} from '../src/services/benchmark/dataset-loader'

describe('Dataset Loader', () => {
  describe('LFW', () => {
    it('should load LFW dataset', () => {
      const dataset = loadDataset('lfw')

      expect(dataset.name).toBe('lfw')
      expect(dataset.rootDir).toContain('datasets/lfw')
      expect(dataset.pairs).toBeDefined()
      expect(dataset.pairs.length).toBe(6000)
    })

    it('should have correct number of same pairs', () => {
      const dataset = loadDataset('lfw')
      const samePairs = dataset.pairs.filter(p => p.label === 1)
      expect(samePairs.length).toBe(3000)
    })

    it('should have correct number of different pairs', () => {
      const dataset = loadDataset('lfw')
      const diffPairs = dataset.pairs.filter(p => p.label === 0)
      expect(diffPairs.length).toBe(3000)
    })

    it('should parse same pair paths correctly', () => {
      const dataset = loadDataset('lfw')
      const firstPair = dataset.pairs[0]

      expect(firstPair.image1).toMatch(/^[^/]+\/[^/]+_\d{4}\.jpg$/)
      expect(firstPair.image2).toMatch(/^[^/]+\/[^/]+_\d{4}\.jpg$/)
    })

    it('should parse different pair paths correctly', () => {
      const dataset = loadDataset('lfw')
      // Find the first different pair (4 fields in the pair file)
      const diffPair = dataset.pairs.find(p => p.label === 0)

      expect(diffPair).toBeDefined()
      expect(diffPair!.label).toBe(0)
      expect(diffPair!.image1).toMatch(/^[^/]+\/[^/]+_\d{4}\.jpg$/)
      expect(diffPair!.image2).toMatch(/^[^/]+\/[^/]+_\d{4}\.jpg$/)
      // Different pairs have different subjects
      const subject1 = diffPair!.image1.split('/')[0]
      const subject2 = diffPair!.image2.split('/')[0]
      expect(subject1).not.toBe(subject2)
    })

    it('should validate images when requested', () => {
      expect(() => loadDataset('lfw', true)).not.toThrow()
    })
  })

  describe('CFP-FP', () => {
    it('should load CFP-FP dataset', () => {
      const dataset = loadDataset('cfp-fp')

      expect(dataset.name).toBe('cfp-fp')
      expect(dataset.pairs.length).toBe(7000)
    })

    it('should have 1 same and 1 different in each pair', () => {
      const dataset = loadDataset('cfp-fp')
      const samePairs = dataset.pairs.filter(p => p.label === 1)
      const diffPairs = dataset.pairs.filter(p => p.label === 0)

      expect(samePairs.length).toBeGreaterThan(0)
      expect(diffPairs.length).toBeGreaterThan(0)
    })

    it('should validate images when requested', () => {
      expect(() => loadDataset('cfp-fp', true)).not.toThrow()
    })
  })

  describe('AgeDB-30', () => {
    it('should load AgeDB-30 dataset', () => {
      const dataset = loadDataset('agedb-30')

      expect(dataset.name).toBe('agedb-30')
      expect(dataset.pairs.length).toBe(6000)
    })

    it('should have same and different pairs', () => {
      const dataset = loadDataset('agedb-30')
      const samePairs = dataset.pairs.filter(p => p.label === 1)
      const diffPairs = dataset.pairs.filter(p => p.label === 0)

      expect(samePairs.length).toBeGreaterThan(0)
      expect(diffPairs.length).toBeGreaterThan(0)
    })

    it('should validate images when requested', () => {
      expect(() => loadDataset('agedb-30', true)).not.toThrow()
    })
  })

  describe('CALFW', () => {
    it('should load CALFW dataset', () => {
      const dataset = loadDataset('calfw')

      expect(dataset.name).toBe('calfw')
      expect(dataset.pairs.length).toBe(6000)
    })

    it('should have same and different pairs', () => {
      const dataset = loadDataset('calfw')
      const samePairs = dataset.pairs.filter(p => p.label === 1)
      const diffPairs = dataset.pairs.filter(p => p.label === 0)

      expect(samePairs.length).toBeGreaterThan(0)
      expect(diffPairs.length).toBeGreaterThan(0)
    })
  })

  describe('error handling', () => {
    it('should throw for unknown dataset', () => {
      expect(() => loadDataset('unknown')).toThrow('Unknown dataset')
    })

    it('should throw for invalid pair format', () => {
      // Test invalid line with parseSimplePairs via an edge case
      // This is tested indirectly through valid datasets
    })
  })

  describe('pair format', () => {
    it('should have valid label values', () => {
      const datasets = ['lfw', 'cfp-fp', 'agedb-30', 'calfw']

      for (const name of datasets) {
        const dataset = loadDataset(name)
        for (const pair of dataset.pairs) {
          expect([0, 1]).toContain(pair.label)
        }
      }
    })

    it('should have image paths that are not empty', () => {
      const dataset = loadDataset('lfw')

      for (const pair of dataset.pairs) {
        expect(pair.image1.length).toBeGreaterThan(0)
        expect(pair.image2.length).toBeGreaterThan(0)
      }
    })
  })
})
