import { describe, expect, it } from 'vitest'
import {
  ARC_FACE_DESTINATION_LANDMARKS,
  decodeOutputs,
  estimateSimilarityTransform,
  nonMaximumSuppression,
  warpAffine
} from '../src/services/face-recognition/face-detection'

const INPUT_640 = { width: 640, height: 640 }

describe('decodeOutputs', () => {
  it('decodes stride-8 outputs using distance2bbox/distance2kps with num_anchors=2 layout', () => {
    const scores = new Float32Array(12_800).fill(0)
    const bboxes = new Float32Array(12_800 * 4).fill(0)
    const kpss = new Float32Array(12_800 * 10).fill(0)

    // anchor index 490 -> loc 245 -> row 3, col 5 (80 cols) -> cx=40, cy=24
    scores[490] = 0.9
    scores[491] = 0.9
    scores[5_000] = 0.1
    bboxes.set([1, 2, 3, 4], 490 * 4)
    bboxes.set([1, 2, 3, 4], 491 * 4)
    kpss.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 490 * 10)
    kpss.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 491 * 10)

    const faces = decodeOutputs(scores, bboxes, kpss, 8, INPUT_640)

    expect(faces).toHaveLength(2)
    expect(faces[0].bbox).toEqual([32, 8, 64, 56])
    expect(faces[0].score).toBeCloseTo(0.9, 5)
    expect(faces[0].landmarks).toEqual([
      [48, 40],
      [64, 56],
      [80, 72],
      [96, 88],
      [112, 104]
    ])
    // second anchor of the same location decodes identically
    expect(faces[1].bbox).toEqual(faces[0].bbox)
    expect(faces[1].landmarks).toEqual(faces[0].landmarks)
  })

  it('decodes stride-16 outputs from a different grid location', () => {
    const scores = new Float32Array(3_200).fill(0)
    const bboxes = new Float32Array(3_200 * 4).fill(0)
    const kpss = new Float32Array(3_200 * 10).fill(0)

    // anchor index 80 -> loc 40 -> row 1, col 0 (40 cols) -> cx=0, cy=16
    scores[80] = 0.85
    bboxes.set([2, 1, 2, 1], 80 * 4)
    kpss.set([0.5, 0.25, 0.75, 0.5, 1, 1, 0.25, 0, 0.5, 0.25], 80 * 10)

    const faces = decodeOutputs(scores, bboxes, kpss, 16, INPUT_640)

    expect(faces).toHaveLength(1)
    expect(faces[0].bbox).toEqual([-32, 0, 32, 32])
    expect(faces[0].landmarks).toEqual([
      [8, 20],
      [12, 24],
      [16, 32],
      [4, 16],
      [8, 20]
    ])
  })

  it('filters boxes below det_thresh', () => {
    const scores = new Float32Array(800).fill(0)
    const bboxes = new Float32Array(800 * 4).fill(0)
    const kpss = new Float32Array(800 * 10).fill(0)

    scores[0] = 0.9
    scores[1] = 0.49
    scores[2] = 0.5
    bboxes.set([1, 1, 1, 1], 0 * 4)
    bboxes.set([1, 1, 1, 1], 1 * 4)
    bboxes.set([1, 1, 1, 1], 2 * 4)

    const faces = decodeOutputs(scores, bboxes, kpss, 32, INPUT_640)

    expect(faces).toHaveLength(2)
    expect(faces[0].score).toBeCloseTo(0.9, 5)
    expect(faces[1].score).toBeCloseTo(0.5, 5)
  })
})

describe('nms', () => {
  it('suppresses overlapping boxes and keeps non-overlapping ones', () => {
    const faces = [
      {
        bbox: [10, 10, 50, 50] as [number, number, number, number],
        score: 0.9,
        landmarks: []
      },
      {
        bbox: [12, 12, 48, 48] as [number, number, number, number],
        score: 0.8,
        landmarks: []
      },
      {
        bbox: [100, 100, 140, 140] as [number, number, number, number],
        score: 0.7,
        landmarks: []
      },
      {
        bbox: [8, 8, 45, 45] as [number, number, number, number],
        score: 0.6,
        landmarks: []
      }
    ]

    const survivors = nonMaximumSuppression(faces, 0.4)

    expect(survivors).toHaveLength(2)
    expect(survivors.map(f => f.bbox)).toEqual([
      [10, 10, 50, 50],
      [100, 100, 140, 140]
    ])
  })

  it('keeps all boxes when there is no overlap', () => {
    const faces = [
      {
        bbox: [0, 0, 10, 10] as [number, number, number, number],
        score: 0.9,
        landmarks: []
      },
      {
        bbox: [50, 50, 60, 60] as [number, number, number, number],
        score: 0.8,
        landmarks: []
      },
      {
        bbox: [100, 100, 110, 110] as [number, number, number, number],
        score: 0.7,
        landmarks: []
      }
    ]

    const survivors = nonMaximumSuppression(faces, 0.4)

    expect(survivors).toHaveLength(3)
  })
})

describe('estimateSimilarityTransform', () => {
  it('recovers the inverse of the transform that generated the source landmarks', () => {
    const m0: [number, number, number, number, number, number] = [
      2, 0, 10, 0, 2, 20
    ]
    const source = ARC_FACE_DESTINATION_LANDMARKS.map(
      ([x, y]): [number, number] => [
        m0[0] * x + m0[1] * y + m0[2],
        m0[3] * x + m0[4] * y + m0[5]
      ]
    )

    const matrix = estimateSimilarityTransform(
      source,
      ARC_FACE_DESTINATION_LANDMARKS
    )

    expect(matrix).not.toBeNull()
    const m = matrix!
    const transformed = source.map(([x, y]) => [
      m[0] * x + m[1] * y + m[2],
      m[3] * x + m[4] * y + m[5]
    ])
    for (let i = 0; i < ARC_FACE_DESTINATION_LANDMARKS.length; i++) {
      expect(
        Math.abs(transformed[i][0] - ARC_FACE_DESTINATION_LANDMARKS[i][0])
      ).toBeLessThan(0.5)
      expect(
        Math.abs(transformed[i][1] - ARC_FACE_DESTINATION_LANDMARKS[i][1])
      ).toBeLessThan(0.5)
    }
  })

  it('recovers a rotated and scaled transform', () => {
    const m0: [number, number, number, number, number, number] = [
      0, -1.5, 100, 1.5, 0, -50
    ]
    const source = ARC_FACE_DESTINATION_LANDMARKS.map(
      ([x, y]): [number, number] => [
        m0[0] * x + m0[1] * y + m0[2],
        m0[3] * x + m0[4] * y + m0[5]
      ]
    )

    const matrix = estimateSimilarityTransform(
      source,
      ARC_FACE_DESTINATION_LANDMARKS
    )

    expect(matrix).not.toBeNull()
    const m = matrix!
    const transformed = source.map(([x, y]) => [
      m[0] * x + m[1] * y + m[2],
      m[3] * x + m[4] * y + m[5]
    ])
    for (let i = 0; i < ARC_FACE_DESTINATION_LANDMARKS.length; i++) {
      expect(
        Math.abs(transformed[i][0] - ARC_FACE_DESTINATION_LANDMARKS[i][0])
      ).toBeLessThan(0.5)
      expect(
        Math.abs(transformed[i][1] - ARC_FACE_DESTINATION_LANDMARKS[i][1])
      ).toBeLessThan(0.5)
    }
  })

  it('returns null for degenerate landmark sets', () => {
    const points: [number, number][] = [
      [10, 10],
      [10, 10],
      [10, 10],
      [10, 10],
      [10, 10]
    ]
    expect(
      estimateSimilarityTransform(points, ARC_FACE_DESTINATION_LANDMARKS)
    ).toBeNull()
  })
})

describe('warpAffine', () => {
  const makePattern = (width: number, height: number): Uint8Array => {
    const data = new Uint8Array(width * height * 3)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 3
        data[i] = x % 256
        data[i + 1] = y % 256
        data[i + 2] = (x + y) % 256
      }
    }
    return data
  }

  it('identity warp maps the input grid exactly', () => {
    const src = makePattern(112, 112)
    const out = warpAffine(src, 112, 112, [1, 0, 0, 0, 1, 0])

    expect(out).toHaveLength(112 * 112 * 3)
    expect(out).toEqual(src)
  })

  it('samples out-of-bounds as 0 and keeps valid pixels', () => {
    const src = makePattern(50, 50)
    const out = warpAffine(src, 50, 50, [1, 0, 0, 0, 1, 0], 112, 112)

    expect(out).toHaveLength(112 * 112 * 3)
    const at = (x: number, y: number): number => (y * 112 + x) * 3
    expect(out[at(49, 49)]).toBe(49)
    expect(out[at(50, 49)]).toBe(0)
    expect(out[at(49, 50)]).toBe(0)
    expect(out[at(111, 111)]).toBe(0)
  })

  it('applies a translation', () => {
    const src = makePattern(112, 112)
    // shift output by (+5,+3): output(x,y) samples src(x-5, y-3)
    const out = warpAffine(src, 112, 112, [1, 0, 5, 0, 1, 3])

    expect(out[0]).toBe(0)
    const at = (x: number, y: number): number => (y * 112 + x) * 3
    // output(10,8) samples src(5,5) -> R=5, G=5, B=10
    expect(out[at(10, 8)]).toBe(5)
    expect(out[at(10, 8) + 1]).toBe(5)
    expect(out[at(10, 8) + 2]).toBe(10)
  })
})
