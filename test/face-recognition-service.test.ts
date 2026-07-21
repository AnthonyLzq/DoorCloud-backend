import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FaceRecognitionService } from '../src/services/face-recognition'

describe('FaceRecognitionService', () => {
  let service: FaceRecognitionService

  beforeEach(() => {
    service = new FaceRecognitionService()
  })

  afterEach(async () => {
    if (service.isInitialized()) {
      await service.shutdown()
    }
  })

  describe('init', () => {
    it('should initialize service successfully', async () => {
      await service.init()
      expect(service.isInitialized()).toBe(true)
    })

    it('should throw error if already initialized', async () => {
      await service.init()
      await expect(service.init()).rejects.toThrow(
        'FaceRecognitionService already initialized'
      )
    })
  })

  describe('shutdown', () => {
    it('should shutdown service successfully', async () => {
      await service.init()
      expect(service.isInitialized()).toBe(true)

      await service.shutdown()
      expect(service.isInitialized()).toBe(false)
    })

    it('should handle shutdown when not initialized', async () => {
      await expect(service.shutdown()).resolves.not.toThrow()
    })
  })

  describe('listModels', () => {
    it('should throw error if not initialized', async () => {
      await expect(service.listModels()).rejects.toThrow(
        'FaceRecognitionService not initialized. Call init() first.'
      )
    })

    it('should return empty array when no models loaded', async () => {
      await service.init()
      const models = await service.listModels()
      expect(Array.isArray(models)).toBe(true)
      expect(models.length).toBe(0)
    })
  })

  describe('isInitialized', () => {
    it('should return false before init', () => {
      expect(service.isInitialized()).toBe(false)
    })

    it('should return true after init', async () => {
      await service.init()
      expect(service.isInitialized()).toBe(true)
    })

    it('should return false after shutdown', async () => {
      await service.init()
      await service.shutdown()
      expect(service.isInitialized()).toBe(false)
    })
  })

  describe('getEmbedding', () => {
    it('should throw error if not initialized', async () => {
      const image = Buffer.from('test')
      await expect(service.getEmbedding(image, 'test-model')).rejects.toThrow(
        'FaceRecognitionService not initialized. Call init() first.'
      )
    })

    it('should throw error if model not loaded', async () => {
      await service.init()
      const image = Buffer.from('test')
      await expect(
        service.getEmbedding(image, 'non-existent-model')
      ).rejects.toThrow()
    })
  })

  describe('compare', () => {
    it('should throw error if not initialized', async () => {
      const image1 = Buffer.from('test1')
      const image2 = Buffer.from('test2')
      await expect(
        service.compare(image1, image2, 'test-model')
      ).rejects.toThrow(
        'FaceRecognitionService not initialized. Call init() first.'
      )
    })

    it('should throw error if model not loaded', async () => {
      await service.init()
      const image1 = Buffer.from('test1')
      const image2 = Buffer.from('test2')
      await expect(
        service.compare(image1, image2, 'non-existent-model')
      ).rejects.toThrow()
    })
  })

  describe('calculateSimilarity', () => {
    it('should return 1 for identical embeddings', () => {
      const embedding = new Float32Array([1, 2, 3, 4])
      const similarity = service.calculateSimilarity(embedding, embedding)
      expect(similarity).toBeCloseTo(1, 5)
    })

    it('should return 0 for orthogonal embeddings', () => {
      const embedding1 = new Float32Array([1, 0])
      const embedding2 = new Float32Array([0, 1])
      const similarity = service.calculateSimilarity(embedding1, embedding2)
      expect(similarity).toBeCloseTo(0, 5)
    })

    it('should return -1 for opposite embeddings', () => {
      const embedding1 = new Float32Array([1, 2, 3])
      const embedding2 = new Float32Array([-1, -2, -3])
      const similarity = service.calculateSimilarity(embedding1, embedding2)
      expect(similarity).toBeCloseTo(-1, 5)
    })

    it('should throw error for different size embeddings', () => {
      const embedding1 = new Float32Array([1, 2, 3])
      const embedding2 = new Float32Array([1, 2])
      expect(() => service.calculateSimilarity(embedding1, embedding2)).toThrow(
        'Embedding size mismatch'
      )
    })

    it('should return 0 for zero embeddings', () => {
      const embedding1 = new Float32Array([0, 0, 0])
      const embedding2 = new Float32Array([0, 0, 0])
      const similarity = service.calculateSimilarity(embedding1, embedding2)
      expect(similarity).toBe(0)
    })
  })
})
