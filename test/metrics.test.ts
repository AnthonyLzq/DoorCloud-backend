import { describe, it, expect } from 'vitest'
import {
  calculateROC,
  calculateTarAtFar,
  calculateEER,
  calculateAUC,
  calculateAllMetrics
} from '../src/services/benchmark/metrics'

describe('Metrics Calculation', () => {
  describe('calculateROC', () => {
    it('should return empty array for empty inputs', () => {
      expect(calculateROC([], [])).toEqual([])
    })

    it('should throw on length mismatch', () => {
      expect(() => calculateROC([1, 2], [1])).toThrow('Length mismatch')
    })

    it('should throw if no positive labels', () => {
      expect(() => calculateROC([1, 2], [0, 0])).toThrow(
        'must contain both positive'
      )
    })

    it('should throw if no negative labels', () => {
      expect(() => calculateROC([1, 2], [1, 1])).toThrow(
        'must contain both positive'
      )
    })

    it('should produce perfect ROC for perfect predictions', () => {
      // Perfect separation: all positives have higher similarity than negatives
      const sims = [0.9, 0.8, 0.2, 0.1]
      const labels = [1, 1, 0, 0]
      const roc = calculateROC(sims, labels)

      // At FAR=0, TPR should be 1
      const atFar0 = roc.filter(p => p.far === 0)
      expect(atFar0.length).toBeGreaterThan(0)
      expect(atFar0[atFar0.length - 1].tpr).toBe(1)
    })

    it('should produce ROC where first point is from highest similarity', () => {
      const sims = [0.1, 0.9, 0.5]
      const labels = [0, 1, 0]
      const roc = calculateROC(sims, labels)

      // First point should be the highest similarity (0.9, label=1)
      expect(roc[0].far).toBe(0) // First item is a true positive
      expect(roc[0].tpr).toBeGreaterThan(0)
    })
  })

  describe('calculateTarAtFar', () => {
    it('should return 0 for empty ROC', () => {
      expect(calculateTarAtFar([], 0.001)).toBe(0)
    })

    it('should find correct TAR at FAR', () => {
      const roc = [
        { far: 0.0, tpr: 0.8 },
        { far: 0.001, tpr: 0.9 },
        { far: 0.01, tpr: 0.95 },
        { far: 0.1, tpr: 1.0 }
      ]

      expect(calculateTarAtFar(roc, 0.001)).toBeCloseTo(0.9, 5)
      expect(calculateTarAtFar(roc, 0.01)).toBeCloseTo(0.95, 5)
    })

    it('should find closest point not exceeding target FAR', () => {
      const roc = [
        { far: 0.0, tpr: 0.5 },
        { far: 0.005, tpr: 0.8 },
        { far: 0.02, tpr: 0.95 },
        { far: 0.1, tpr: 1.0 }
      ]

      // At FAR=0.01, should use FAR=0.005 (closest not exceeding)
      expect(calculateTarAtFar(roc, 0.01)).toBeCloseTo(0.8, 5)
    })
  })

  describe('calculateEER', () => {
    it('should return 0 for empty ROC', () => {
      expect(calculateEER([])).toBe(0)
    })

    it('should find EER correctly for known case', () => {
      // ROC where FAR crosses FRR around 0.1
      // FAR:  0.0  0.05  0.1   0.2   0.5   1.0
      // TPR:  0.0  0.6   0.85  0.95  0.99  1.0
      // FRR:  1.0  0.4   0.15  0.05  0.01  0.0
      // FAR ≈ FRR at index 2 (FAR=0.1, FRR=0.15) → EER ≈ 0.125
      const roc = [
        { far: 0.0, tpr: 0.0 },
        { far: 0.05, tpr: 0.6 },
        { far: 0.1, tpr: 0.85 },
        { far: 0.2, tpr: 0.95 },
        { far: 0.5, tpr: 0.99 },
        { far: 1.0, tpr: 1.0 }
      ]

      const eer = calculateEER(roc)
      expect(eer).toBeGreaterThan(0.1)
      expect(eer).toBeLessThan(0.15)
    })
  })

  describe('calculateAUC', () => {
    it('should return 0.5 for empty/single-point ROC', () => {
      expect(calculateAUC([])).toBe(0.5)
      expect(calculateAUC([{ far: 0, tpr: 1 }])).toBe(0.5)
    })

    it('should return 1 for perfect ROC', () => {
      const roc = [
        { far: 0.0, tpr: 0.0 },
        { far: 0.0, tpr: 1.0 },
        { far: 1.0, tpr: 1.0 }
      ]

      expect(calculateAUC(roc)).toBeCloseTo(1.0, 5)
    })

    it('should return 0.5 for diagonal ROC', () => {
      const roc = [
        { far: 0.0, tpr: 0.0 },
        { far: 0.5, tpr: 0.5 },
        { far: 1.0, tpr: 1.0 }
      ]

      expect(calculateAUC(roc)).toBeCloseTo(0.5, 5)
    })
  })

  describe('calculateAllMetrics', () => {
    it('should compute all metrics for known case', () => {
      // Perfect separation case
      const sims = [0.95, 0.9, 0.85, 0.2, 0.15, 0.1]
      const labels = [1, 1, 1, 0, 0, 0]

      const metrics = calculateAllMetrics(sims, labels)

      expect(metrics.auc).toBeCloseTo(1.0, 1)
      expect(metrics.tarAtFar001).toBe(1)
      expect(metrics.tarAtFar01).toBe(1)
      expect(metrics.tarAtFar1).toBe(1)
      expect(metrics.eer).toBeCloseTo(0, 0)
      expect(metrics.rocPoints.length).toBe(6)
    })

    it('should handle imperfect predictions', () => {
      // Some overlap between classes
      const sims = [0.9, 0.8, 0.6, 0.4, 0.3, 0.2]
      const labels = [1, 1, 0, 0, 1, 0]

      const metrics = calculateAllMetrics(sims, labels)

      expect(metrics.auc).toBeGreaterThan(0.5)
      expect(metrics.auc).toBeLessThan(1.0)
      expect(metrics.rocPoints.length).toBe(6)
    })
  })
})
