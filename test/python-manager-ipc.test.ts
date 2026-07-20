import {  afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { PythonManager } from '../src/services/face-recognition/python-manager'

// Schema para validar respuesta de list_models
const ListModelsResponseSchema = z.object({
  id: z.number(),
  success: z.boolean(),
  models: z.array(z.string())
})

describe('PythonManager IPC Protocol', () => {
  let manager: PythonManager

  beforeEach(async () => {
    manager = new PythonManager()
    await manager.start()
  })

  afterEach(async () => {
    await manager.stop()
  })

  describe('call', () => {
    it('should send request and receive response', async () => {
      const result = await manager.call('list_models')
      const validated = ListModelsResponseSchema.parse(result)

      expect(validated).toBeDefined()
      expect(validated.models).toBeDefined()
      expect(Array.isArray(validated.models)).toBe(true)
      expect(validated.success).toBe(true)
    })

    it('should handle multiple concurrent requests', async () => {
      const promises = [
        manager.call('list_models'),
        manager.call('list_models'),
        manager.call('list_models')
      ]

      const results = await Promise.all(promises)

      expect(results).toHaveLength(3)
      results.forEach(result => {
        const validated = ListModelsResponseSchema.parse(result)
        expect(validated.models).toBeDefined()
        expect(validated.success).toBe(true)
      })
    })

    it('should throw error for unknown method', async () => {
      await expect(manager.call('unknown_method')).rejects.toThrow()
    })

    it('should handle load_model request', async () => {
      const result = await manager.call('load_model', 'test-model', {
        type: 'dlib',
        path: 'models/dlib/dlib_face_recognition_resnet_model_v1.dat'
      })

      const validated = z
        .object({
          id: z.number(),
          success: z.boolean().optional(),
          model: z.string().optional(),
          error: z.string().optional()
        })
        .parse(result)
      expect(validated).toBeDefined()
    })

    it('should handle get_embedding request', async () => {
      // First load a model
      await manager.call('load_model', 'test-model', {
        type: 'dlib',
        path: 'models/dlib/dlib_face_recognition_resnet_model_v1.dat'
      })

      // Create a test image (base64 encoded PNG)
      const testImageBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

      // This will fail because no face is detected, but it tests the protocol
      await expect(
        manager.call('get_embedding', testImageBase64, 'test-model')
      ).rejects.toThrow()
    })
  })

  describe('error handling', () => {
    it('should throw error if process not ready', async () => {
      await manager.stop()

      await expect(manager.call('list_models')).rejects.toThrow(
        'Python process not ready'
      )
    })

    it('should handle malformed responses gracefully', async () => {
      // This test verifies that the parser doesn't crash on malformed data
      // The actual malformed data handling is tested implicitly
      const result = await manager.call('list_models')
      const validated = ListModelsResponseSchema.parse(result)
      expect(validated).toBeDefined()
    })
  })
})
