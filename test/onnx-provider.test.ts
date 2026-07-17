import { describe, it, expect, beforeAll } from 'vitest'
import { ONNXProvider } from '../src/services/face-recognition/onnx-provider'
import sharp from 'sharp'

describe('ONNXProvider', () => {
  let provider: ONNXProvider
  let testImage: Buffer

  beforeAll(async () => {
    provider = new ONNXProvider()
    
    // Create a test image (100x100 RGB)
    testImage = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 128, g: 64, b: 192 }
      }
    })
      .png()
      .toBuffer()
  })

  describe('preprocess', () => {
    it('should resize image to 112x112', async () => {
      const tensor = await provider.preprocess(testImage)
      
      expect(tensor.dims).toEqual([1, 3, 112, 112])
    })

    it('should normalize pixel values to [-1, 1]', async () => {
      const tensor = await provider.preprocess(testImage)
      const data = tensor.data as Float32Array
      
      // Check that all values are in [-1, 1] range
      for (let i = 0; i < data.length; i++) {
        expect(data[i]).toBeGreaterThanOrEqual(-1.0)
        expect(data[i]).toBeLessThanOrEqual(1.0)
      }
    })

    it('should convert RGB to CHW format', async () => {
      const tensor = await provider.preprocess(testImage)
      const data = tensor.data as Float32Array
      
      // Tensor should have shape [1, 3, 112, 112]
      // Channel 0 (R) should be at indices 0 to 112*112-1
      // Channel 1 (G) should be at indices 112*112 to 2*112*112-1
      // Channel 2 (B) should be at indices 2*112*112 to 3*112*112-1
      
      expect(data.length).toBe(3 * 112 * 112)
    })

    it('should handle different input image sizes', async () => {
      const smallImage = await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 3,
          background: { r: 255, g: 0, b: 0 }
        }
      })
        .png()
        .toBuffer()

      const tensor = await provider.preprocess(smallImage)
      expect(tensor.dims).toEqual([1, 3, 112, 112])
    })

    it('should handle images with alpha channel', async () => {
      const imageWithAlpha = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4,
          background: { r: 128, g: 64, b: 192, alpha: 0.8 }
        }
      })
        .png()
        .toBuffer()

      const tensor = await provider.preprocess(imageWithAlpha)
      expect(tensor.dims).toEqual([1, 3, 112, 112])
    })

    it('should throw error for invalid image data', async () => {
      const invalidImage = Buffer.from('not an image')
      
      await expect(provider.preprocess(invalidImage)).rejects.toThrow('Image preprocessing failed')
    })
  })

  describe('model management', () => {
    it('should track loaded models', async () => {
      const models = provider.listModels()
      expect(Array.isArray(models)).toBe(true)
    })

    it('should check if model is loaded', () => {
      expect(provider.hasModel('nonexistent')).toBe(false)
    })

    it('should return null metrics for unloaded model', () => {
      const metrics = provider.getMetrics('nonexistent')
      expect(metrics).toBeNull()
    })
  })
})
