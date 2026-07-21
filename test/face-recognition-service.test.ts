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
})
