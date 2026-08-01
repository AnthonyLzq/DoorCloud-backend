import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { VERIFY_FETCH_TIMEOUT_MS } from '../src/config/constants'
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

  describe('getMetrics', () => {
    it('should throw error if not initialized', () => {
      expect(() => service.getMetrics('test-model')).toThrow(
        'FaceRecognitionService not initialized. Call init() first.'
      )
    })

    it('should return null for non-existent model', async () => {
      await service.init()
      const metrics = service.getMetrics('non-existent-model')
      expect(metrics).toBeNull()
    })

    it('should return metrics with approach for ONNX model', async () => {
      await service.init()

      // Mock ONNX provider to return metrics
      const mockMetrics = { avgLatency: 50, requestCount: 10 }
      vi.spyOn(service['onnxProvider'], 'getMetrics').mockReturnValue(
        mockMetrics
      )
      vi.spyOn(service['onnxProvider'], 'hasModel').mockReturnValue(true)

      const metrics = service.getMetrics('onnx-model')

      expect(metrics).toEqual({
        avgLatency: 50,
        requestCount: 10,
        approach: 'onnx'
      })
    })

    it('should return metrics with approach for Python model', async () => {
      await service.init()

      // Mock Python manager to return metrics
      const mockMetrics = { avgLatency: 100, requestCount: 5 }
      vi.spyOn(service['pythonManager'], 'getMetrics').mockReturnValue(
        mockMetrics
      )
      vi.spyOn(service['onnxProvider'], 'hasModel').mockReturnValue(false)

      const metrics = service.getMetrics('python-model')

      expect(metrics).toEqual({
        avgLatency: 100,
        requestCount: 5,
        approach: 'python'
      })
    })
  })

  describe('verify', () => {
    const probeFace = {
      bbox: [10, 10, 50, 50] as [number, number, number, number],
      score: 0.9,
      landmarks: [
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
        [5, 5]
      ] as [number, number][]
    }

    const photoBuffer = Buffer.from('stored-photo-bytes')

    async function initOnnx(): Promise<void> {
      vi.spyOn(service['onnxProvider'], 'loadModel').mockResolvedValue()
      vi.spyOn(service['pythonManager'], 'start').mockResolvedValue()
      await service.init({ mode: 'onnx' })
    }

    function fetchResponse(body: Buffer) {
      return {
        ok: true,
        arrayBuffer: async () =>
          body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
      }
    }

    afterEach(() => {
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
    })

    it('returns no-face without throwing when the probe has no face (RF-2)', async () => {
      await initOnnx()
      const detectSpy = vi
        .spyOn(service['onnxProvider'], 'detectFaces')
        .mockResolvedValue([])
      const consoleSpy = vi.spyOn(console, 'log')
      const fetchSpy = vi.fn(async () => fetchResponse(photoBuffer))
      vi.stubGlobal('fetch', fetchSpy)

      const result = await service.verify(Buffer.from('probe-image'), [
        { name: 'alice', url: 'http://photos.test/alice.jpg' }
      ])

      expect(result).toEqual({ match: false, reason: 'no-face' })
      expect(detectSpy).toHaveBeenCalledTimes(1)
      expect(fetchSpy).not.toHaveBeenCalled()

      const logs = consoleSpy.mock.calls.map(call => String(call[0]))
      expect(logs.some(log => log.includes('no face'))).toBe(true)
    })

    it('returns a match when cosine similarity reaches the threshold (RF-1)', async () => {
      await initOnnx()
      const detectSpy = vi
        .spyOn(service['onnxProvider'], 'detectFaces')
        .mockResolvedValueOnce([probeFace])
        .mockResolvedValueOnce([probeFace])
      const embedSpy = vi
        .spyOn(service['onnxProvider'], 'getAlignedEmbedding')
        .mockResolvedValueOnce(new Float32Array([1, 0, 0]))
        .mockResolvedValueOnce(new Float32Array([1, 0, 0]))
      const fetchSpy = vi.fn(async () => fetchResponse(photoBuffer))
      vi.stubGlobal('fetch', fetchSpy)

      const result = await service.verify(
        Buffer.from('probe-image'),
        [{ name: 'alice', url: 'http://photos.test/alice.jpg' }],
        { threshold: 0.5 }
      )

      expect(result).toEqual({
        match: true,
        name: 'alice',
        similarity: 1,
        reason: 'match'
      })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(fetchSpy.mock.calls[0][0]).toBe('http://photos.test/alice.jpg')
      expect(fetchSpy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
      expect(detectSpy).toHaveBeenCalledTimes(2)
      expect(embedSpy).toHaveBeenCalledTimes(2)
    })

    it('returns no-match without a name when the best cosine is below threshold (RF-1)', async () => {
      await initOnnx()
      vi.spyOn(service['onnxProvider'], 'detectFaces')
        .mockResolvedValueOnce([probeFace])
        .mockResolvedValueOnce([probeFace])
      vi.spyOn(service['onnxProvider'], 'getAlignedEmbedding')
        .mockResolvedValueOnce(new Float32Array([1, 0, 0]))
        .mockResolvedValueOnce(new Float32Array([0, 1, 0]))
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => fetchResponse(photoBuffer))
      )

      const result = await service.verify(
        Buffer.from('probe-image'),
        [{ name: 'alice', url: 'http://photos.test/alice.jpg' }],
        { threshold: 0.5 }
      )

      expect(result.match).toBe(false)
      expect(result.reason).toBe('no-match')
      expect(result.name).toBeUndefined()
      expect(result.similarity).toBe(0)
    })

    it('downloads stored photos in parallel and stops inference after the first match', async () => {
      await initOnnx()
      const detectSpy = vi
        .spyOn(service['onnxProvider'], 'detectFaces')
        .mockResolvedValueOnce([probeFace])
        .mockResolvedValueOnce([probeFace])
      vi.spyOn(service['onnxProvider'], 'getAlignedEmbedding')
        .mockResolvedValueOnce(new Float32Array([1, 0, 0]))
        .mockResolvedValueOnce(new Float32Array([1, 0, 0]))
      const fetchSpy = vi.fn(async () => fetchResponse(photoBuffer))
      vi.stubGlobal('fetch', fetchSpy)

      const result = await service.verify(
        Buffer.from('probe-image'),
        [
          { name: 'alice', url: 'http://photos.test/alice.jpg' },
          { name: 'bob', url: 'http://photos.test/bob.jpg' },
          { name: 'carol', url: 'http://photos.test/carol.jpg' }
        ],
        { threshold: 0.5 }
      )

      expect(result).toEqual({
        match: true,
        name: 'alice',
        similarity: 1,
        reason: 'match'
      })
      // Downloads run in parallel for every candidate, but inference stops
      // at the first match: 1 probe detect + 1 alice detect.
      expect(fetchSpy).toHaveBeenCalledTimes(3)
      expect(detectSpy).toHaveBeenCalledTimes(2)
    })

    it('caps the number of stored photos evaluated at 10', async () => {
      await initOnnx()
      const detectSpy = vi
        .spyOn(service['onnxProvider'], 'detectFaces')
        .mockResolvedValue([probeFace])
      vi.spyOn(service['onnxProvider'], 'getAlignedEmbedding')
        .mockResolvedValueOnce(new Float32Array([1, 0, 0]))
        .mockResolvedValue(new Float32Array([0, 1, 0]))
      const fetchSpy = vi.fn(async (_url: string) => fetchResponse(photoBuffer))
      vi.stubGlobal('fetch', fetchSpy)

      const photos = Array.from({ length: 12 }, (_, index) => ({
        name: `user${index}`,
        url: `http://photos.test/${index}.jpg`
      }))

      const result = await service.verify(Buffer.from('probe-image'), photos, {
        threshold: 0.9
      })

      expect(result.match).toBe(false)
      expect(result.reason).toBe('no-match')
      expect(fetchSpy).toHaveBeenCalledTimes(10)
      expect(fetchSpy.mock.calls[0][0]).toBe('http://photos.test/0.jpg')
      expect(fetchSpy.mock.calls[9][0]).toBe('http://photos.test/9.jpg')
      expect(detectSpy).toHaveBeenCalledTimes(11)
    })

    it('uses the highest-scoring face when the probe has multiple faces (D4)', async () => {
      await initOnnx()
      const lowScoreFace = { ...probeFace, score: 0.6 }
      const highScoreFace = { ...probeFace, score: 0.95 }
      const embedSpy = vi
        .spyOn(service['onnxProvider'], 'getAlignedEmbedding')
        .mockResolvedValueOnce(new Float32Array([1, 0, 0]))
        .mockResolvedValueOnce(new Float32Array([1, 0, 0]))
      vi.spyOn(service['onnxProvider'], 'detectFaces')
        .mockResolvedValueOnce([lowScoreFace, highScoreFace])
        .mockResolvedValueOnce([probeFace])
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => fetchResponse(photoBuffer))
      )

      const result = await service.verify(
        Buffer.from('probe-image'),
        [{ name: 'alice', url: 'http://photos.test/alice.jpg' }],
        { threshold: 0.5 }
      )

      expect(result).toEqual({
        match: true,
        name: 'alice',
        similarity: 1,
        reason: 'match'
      })
      expect(embedSpy.mock.calls[0][1]).toEqual(highScoreFace.landmarks)
    })

    it('skips a stored photo without a face and continues to the next', async () => {
      await initOnnx()
      vi.spyOn(service['onnxProvider'], 'detectFaces')
        .mockResolvedValueOnce([probeFace])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([probeFace])
      vi.spyOn(service['onnxProvider'], 'getAlignedEmbedding')
        .mockResolvedValueOnce(new Float32Array([1, 0, 0]))
        .mockResolvedValueOnce(new Float32Array([1, 0, 0]))
      const fetchSpy = vi.fn(async () => fetchResponse(photoBuffer))
      vi.stubGlobal('fetch', fetchSpy)

      const result = await service.verify(
        Buffer.from('probe-image'),
        [
          { name: 'alice', url: 'http://photos.test/alice.jpg' },
          { name: 'bob', url: 'http://photos.test/bob.jpg' }
        ],
        { threshold: 0.5 }
      )

      expect(result).toEqual({
        match: true,
        name: 'bob',
        similarity: 1,
        reason: 'match'
      })
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('returns no-match without similarity when no stored photo had a face', async () => {
      await initOnnx()
      vi.spyOn(service['onnxProvider'], 'detectFaces')
        .mockResolvedValueOnce([probeFace])
        .mockResolvedValueOnce([])
      vi.spyOn(
        service['onnxProvider'],
        'getAlignedEmbedding'
      ).mockResolvedValue(new Float32Array([1, 0, 0]))
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => fetchResponse(photoBuffer))
      )

      const result = await service.verify(
        Buffer.from('probe-image'),
        [{ name: 'alice', url: 'http://photos.test/alice.jpg' }],
        { threshold: 0.5 }
      )

      expect(result).toEqual({ match: false, reason: 'no-match' })
    })

    it('returns no-face when probe inference fails (R4)', async () => {
      await initOnnx()
      vi.spyOn(service['onnxProvider'], 'detectFaces').mockRejectedValue(
        new Error('Model not loaded: det_500m')
      )
      const fetchSpy = vi.fn(async () => fetchResponse(photoBuffer))
      vi.stubGlobal('fetch', fetchSpy)

      const result = await service.verify(
        Buffer.from('probe-image'),
        [{ name: 'alice', url: 'http://photos.test/alice.jpg' }],
        { threshold: 0.5 }
      )

      expect(result).toEqual({ match: false, reason: 'no-face' })
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('returns no-face when probe embedding fails (R4)', async () => {
      await initOnnx()
      vi.spyOn(service['onnxProvider'], 'detectFaces').mockResolvedValue([
        probeFace
      ])
      vi.spyOn(
        service['onnxProvider'],
        'getAlignedEmbedding'
      ).mockRejectedValue(
        new Error('Failed to estimate similarity transform from landmarks')
      )

      const result = await service.verify(
        Buffer.from('probe-image'),
        [{ name: 'alice', url: 'http://photos.test/alice.jpg' }],
        { threshold: 0.5 }
      )

      expect(result).toEqual({ match: false, reason: 'no-face' })
    })

    it('skips a stored photo whose inference fails and continues (R4)', async () => {
      await initOnnx()
      vi.spyOn(service['onnxProvider'], 'detectFaces')
        .mockResolvedValueOnce([probeFace])
        .mockRejectedValueOnce(
          new Error('Failed to estimate similarity transform from landmarks')
        )
        .mockResolvedValueOnce([probeFace])
      vi.spyOn(service['onnxProvider'], 'getAlignedEmbedding')
        .mockResolvedValueOnce(new Float32Array([1, 0, 0]))
        .mockResolvedValueOnce(new Float32Array([1, 0, 0]))
      const fetchSpy = vi.fn(async () => fetchResponse(photoBuffer))
      vi.stubGlobal('fetch', fetchSpy)

      const result = await service.verify(
        Buffer.from('probe-image'),
        [
          { name: 'alice', url: 'http://photos.test/alice.jpg' },
          { name: 'bob', url: 'http://photos.test/bob.jpg' }
        ],
        { threshold: 0.5 }
      )

      expect(result).toEqual({
        match: true,
        name: 'bob',
        similarity: 1,
        reason: 'match'
      })
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('aborts stored photo fetches that exceed the timeout (R4)', async () => {
      await initOnnx()
      vi.spyOn(service['onnxProvider'], 'detectFaces').mockResolvedValue([
        probeFace
      ])
      vi.spyOn(service['onnxProvider'], 'getAlignedEmbedding')
        .mockResolvedValueOnce(new Float32Array([1, 0, 0]))
        .mockResolvedValueOnce(new Float32Array([1, 0, 0]))
      const fetchSpy = vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new Error('Aborted'))
            })
          })
      )
      vi.stubGlobal('fetch', fetchSpy)

      const result = await service.verify(
        Buffer.from('probe-image'),
        [{ name: 'alice', url: 'http://photos.test/alice.jpg' }],
        { threshold: 0.5 }
      )

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(fetchSpy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
      expect(result).toEqual({ match: false, reason: 'no-match' })
      expect(VERIFY_FETCH_TIMEOUT_MS).toBeGreaterThan(0)
    })
  })

  describe('onnx lifecycle', () => {
    afterEach(() => {
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
    })

    it('loads det_500m and w600k_mbf once without spawning Python', async () => {
      const loadSpy = vi
        .spyOn(service['onnxProvider'], 'loadModel')
        .mockResolvedValue()
      const pythonStartSpy = vi
        .spyOn(service['pythonManager'], 'start')
        .mockResolvedValue()

      await service.init({ mode: 'onnx' })

      expect(service.isInitialized()).toBe(true)
      expect(loadSpy).toHaveBeenCalledTimes(2)
      expect(loadSpy).toHaveBeenNthCalledWith(
        1,
        'det_500m',
        'models/insightface/det_500m.onnx',
        expect.any(Object)
      )
      expect(loadSpy).toHaveBeenNthCalledWith(
        2,
        'w600k_mbf',
        'models/insightface/w600k_mbf.onnx',
        expect.any(Object)
      )
      expect(pythonStartSpy).not.toHaveBeenCalled()
    })

    it('releases ONNX sessions on shutdown and no-ops on Python', async () => {
      vi.spyOn(service['onnxProvider'], 'loadModel').mockResolvedValue()
      vi.spyOn(service['pythonManager'], 'start').mockResolvedValue()
      await service.init({ mode: 'onnx' })

      const unloadSpy = vi
        .spyOn(service['onnxProvider'], 'unloadModel')
        .mockResolvedValue()
      const pythonStopSpy = vi
        .spyOn(service['pythonManager'], 'stop')
        .mockResolvedValue()

      await service.shutdown()

      expect(unloadSpy).toHaveBeenCalledTimes(2)
      expect(unloadSpy).toHaveBeenCalledWith('det_500m')
      expect(unloadSpy).toHaveBeenCalledWith('w600k_mbf')
      expect(pythonStopSpy).not.toHaveBeenCalled()
      expect(service.isInitialized()).toBe(false)
    })

    it('skips Python model listing in onnx mode', async () => {
      vi.spyOn(service['onnxProvider'], 'loadModel').mockResolvedValue()
      await service.init({ mode: 'onnx' })
      const pythonListSpy = vi
        .spyOn(service['pythonManager'], 'listModels')
        .mockResolvedValue(['dlib'])

      const models = await service.listModels()

      expect(pythonListSpy).not.toHaveBeenCalled()
      expect(models.some(model => model.approach === 'python')).toBe(false)
    })

    it('rejects Python-backed getEmbedding when Python is not started', async () => {
      vi.spyOn(service['onnxProvider'], 'loadModel').mockResolvedValue()
      await service.init({ mode: 'onnx' })

      await expect(
        service.getEmbedding(Buffer.from('image'), 'dlib')
      ).rejects.toThrow(/Python process not started/)
    })
  })
})
