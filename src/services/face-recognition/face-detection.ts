export const DETECTOR_STRIDES = [8, 16, 32]
export const ANCHORS_PER_LOCATION = 2
export const DEFAULT_DETECTION_THRESHOLD = 0.5
export const DEFAULT_NMS_THRESHOLD = 0.4

export const ARC_FACE_DESTINATION_LANDMARKS: ReadonlyArray<
  readonly [number, number]
> = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041]
]

export interface DecodedFace {
  bbox: [number, number, number, number]
  score: number
  landmarks: [number, number][]
}

export type AffineMatrix = [number, number, number, number, number, number]

/**
 * Decodes one FPN stride of detector outputs into candidate faces.
 *
 * Mirrors insightface's scrfd.py distance2bbox/distance2kps:
 * the raw predictions are scaled by the stride and combined with anchor
 * centers laid out row-major over the stride grid, duplicated per anchor.
 *
 * @param scores flat per-anchor scores (model shape [N,1])
 * @param boxDistances flat per-anchor bbox distances (model shape [N,4])
 * @param landmarkDistances flat per-anchor landmark distances (model shape [N,10])
 * @param stride FPN stride for this output (8, 16 or 32)
 * @param inputSize detector input dimensions (e.g. 640x640)
 * @param detectionThreshold minimum score to keep a box
 */
export function decodeOutputs(
  scores: ArrayLike<number>,
  boxDistances: ArrayLike<number>,
  landmarkDistances: ArrayLike<number>,
  stride: number,
  inputSize: { width: number; height: number },
  detectionThreshold = DEFAULT_DETECTION_THRESHOLD
): DecodedFace[] {
  const gridHeight = Math.round(inputSize.height / stride)
  const gridWidth = Math.round(inputSize.width / stride)
  const locations = gridHeight * gridWidth
  const faces: DecodedFace[] = []

  for (let i = 0; i < locations * ANCHORS_PER_LOCATION; i++) {
    const score = scores[i]
    if (score < detectionThreshold) {
      continue
    }

    const location = Math.floor(i / ANCHORS_PER_LOCATION)
    const row = Math.floor(location / gridWidth)
    const col = location % gridWidth
    const anchorCenterX = col * stride
    const anchorCenterY = row * stride

    const boxOffset = i * 4
    const x1 = anchorCenterX - boxDistances[boxOffset] * stride
    const y1 = anchorCenterY - boxDistances[boxOffset + 1] * stride
    const x2 = anchorCenterX + boxDistances[boxOffset + 2] * stride
    const y2 = anchorCenterY + boxDistances[boxOffset + 3] * stride

    const landmarkOffset = i * 10
    const landmarks: [number, number][] = []
    for (let k = 0; k < 5; k++) {
      landmarks.push([
        anchorCenterX + landmarkDistances[landmarkOffset + k * 2] * stride,
        anchorCenterY + landmarkDistances[landmarkOffset + k * 2 + 1] * stride
      ])
    }

    faces.push({
      bbox: [x1, y1, x2, y2],
      score,
      landmarks
    })
  }

  return faces
}

/**
 * Greedy non-maximum suppression over candidate faces.
 *
 * Uses the +1 area terms from insightface's nms to stay bit-compatible
 * with the Python implementation.
 *
 * @param faces candidates, expected to already be above the detection threshold
 * @param nmsThreshold IoU threshold; boxes overlapping above it are dropped
 * @returns survivors sorted by score descending
 */
export function nonMaximumSuppression(
  faces: DecodedFace[],
  nmsThreshold = DEFAULT_NMS_THRESHOLD
): DecodedFace[] {
  let remainingIndices = faces
    .map((_, index) => index)
    .sort((a, b) => faces[b].score - faces[a].score)
  const boxAreas = faces.map(
    face =>
      (face.bbox[2] - face.bbox[0] + 1) * (face.bbox[3] - face.bbox[1] + 1)
  )

  const survivors: DecodedFace[] = []

  while (remainingIndices.length > 0) {
    const currentIndex = remainingIndices[0]
    survivors.push(faces[currentIndex])

    const rest = remainingIndices.slice(1)
    const currentBox = faces[currentIndex].bbox
    const currentArea = boxAreas[currentIndex]

    const keptIndices: number[] = []
    for (const index of rest) {
      const otherBox = faces[index].bbox
      const intersectionWidth = Math.max(
        0,
        Math.min(currentBox[2], otherBox[2]) -
          Math.max(currentBox[0], otherBox[0]) +
          1
      )
      const intersectionHeight = Math.max(
        0,
        Math.min(currentBox[3], otherBox[3]) -
          Math.max(currentBox[1], otherBox[1]) +
          1
      )
      const intersectionArea = intersectionWidth * intersectionHeight
      const iou =
        intersectionArea / (currentArea + boxAreas[index] - intersectionArea)

      if (iou <= nmsThreshold) {
        keptIndices.push(index)
      }
    }

    // keptIndices keep score-descending order; replace order entirely
    // (insightface: order = order[inds + 1])
    remainingIndices = keptIndices
  }

  return survivors
}

/**
 * Estimates a 4-DOF similarity transform (Umeyama) mapping source landmarks
 * onto destination landmarks, returning the 2x3 matrix in row-major order.
 *
 * Returns null when the source points are degenerate (zero variance).
 */
export function estimateSimilarityTransform(
  source: ReadonlyArray<readonly [number, number]>,
  destination: ReadonlyArray<readonly [number, number]>
): AffineMatrix | null {
  const pointCount = source.length
  if (pointCount === 0 || source.length !== destination.length) {
    return null
  }

  let sourceMeanX = 0
  let sourceMeanY = 0
  let destinationMeanX = 0
  let destinationMeanY = 0
  for (let i = 0; i < pointCount; i++) {
    sourceMeanX += source[i][0]
    sourceMeanY += source[i][1]
    destinationMeanX += destination[i][0]
    destinationMeanY += destination[i][1]
  }
  sourceMeanX /= pointCount
  sourceMeanY /= pointCount
  destinationMeanX /= pointCount
  destinationMeanY /= pointCount

  let covarianceXX = 0
  let covarianceXY = 0
  let covarianceYX = 0
  let covarianceYY = 0
  let sourceVariance = 0
  for (let i = 0; i < pointCount; i++) {
    const sourceX = source[i][0] - sourceMeanX
    const sourceY = source[i][1] - sourceMeanY
    const destinationX = destination[i][0] - destinationMeanX
    const destinationY = destination[i][1] - destinationMeanY
    covarianceXX += sourceX * destinationX
    covarianceXY += sourceX * destinationY
    covarianceYX += sourceY * destinationX
    covarianceYY += sourceY * destinationY
    sourceVariance += sourceX * sourceX + sourceY * sourceY
  }

  if (sourceVariance === 0) {
    return null
  }

  const { left, singular, right } = computeSvd2x2(
    covarianceXX,
    covarianceXY,
    covarianceYX,
    covarianceYY
  )

  const leftDeterminant = left[0] * left[3] - left[1] * left[2]
  const rightDeterminant = right[0] * right[3] - right[1] * right[2]
  const reflectionSign = leftDeterminant * rightDeterminant < 0 ? -1 : 1

  // R = V * diag(1, sign) * U^T (orthogonal Procrustes optimum)
  const rotation00 = right[0] * left[0] + reflectionSign * right[1] * left[1]
  const rotation01 = right[0] * left[2] + reflectionSign * right[1] * left[3]
  const rotation10 = right[2] * left[0] + reflectionSign * right[3] * left[1]
  const rotation11 = right[2] * left[2] + reflectionSign * right[3] * left[3]

  const scale = (singular[0] + reflectionSign * singular[1]) / sourceVariance
  const translationX =
    destinationMeanX -
    scale * (rotation00 * sourceMeanX + rotation01 * sourceMeanY)
  const translationY =
    destinationMeanY -
    scale * (rotation10 * sourceMeanX + rotation11 * sourceMeanY)

  return [
    scale * rotation00,
    scale * rotation01,
    translationX,
    scale * rotation10,
    scale * rotation11,
    translationY
  ]
}

/**
 * SVD of a 2x2 matrix, computed via eigen-decomposition of A^T A.
 *
 * Returns U, singular values and V such that A = U * diag(s) * V^T,
 * with singular values sorted descending.
 */
function computeSvd2x2(
  element00: number,
  element01: number,
  element10: number,
  element11: number
): {
  left: [number, number, number, number]
  singular: [number, number]
  right: [number, number, number, number]
} {
  // Gram matrix A^T A (symmetric 2x2)
  const gram00 = element00 * element00 + element10 * element10
  const gram01 = element00 * element01 + element10 * element11
  const gram11 = element01 * element01 + element11 * element11

  const trace = gram00 + gram11
  const determinant = gram00 * gram11 - gram01 * gram01
  const discriminant = Math.sqrt(Math.max(0, trace * trace - 4 * determinant))
  let eigenvalue1 = (trace + discriminant) / 2
  let eigenvalue2 = (trace - discriminant) / 2
  if (eigenvalue1 < eigenvalue2) {
    const swap = eigenvalue1
    eigenvalue1 = eigenvalue2
    eigenvalue2 = swap
  }
  eigenvalue2 = Math.max(0, eigenvalue2)

  const singularValue1 = Math.sqrt(eigenvalue1)
  const singularValue2 = Math.sqrt(eigenvalue2)

  const eigenvectorFor = (eigenvalue: number): [number, number] | null => {
    let x = gram01
    let y = eigenvalue - gram00
    const norm = Math.hypot(x, y)
    if (norm < 1e-12) {
      return null
    }
    x /= norm
    y /= norm
    return [x, y]
  }

  const firstEigenvector = eigenvectorFor(eigenvalue1) ?? [1, 0]
  const secondEigenvector = eigenvectorFor(eigenvalue2) ?? [
    -firstEigenvector[1],
    firstEigenvector[0]
  ]
  const [firstEigenX, firstEigenY] = firstEigenvector
  const [secondEigenX, secondEigenY] = secondEigenvector

  let firstLeftX =
    (element00 * firstEigenX + element01 * firstEigenY) / singularValue1
  let firstLeftY =
    (element10 * firstEigenX + element11 * firstEigenY) / singularValue1
  const firstLeftNorm = Math.hypot(firstLeftX, firstLeftY)
  if (firstLeftNorm > 0) {
    firstLeftX /= firstLeftNorm
    firstLeftY /= firstLeftNorm
  } else {
    firstLeftX = 1
    firstLeftY = 0
  }

  let secondLeftX =
    (element00 * secondEigenX + element01 * secondEigenY) / singularValue2
  let secondLeftY =
    (element10 * secondEigenX + element11 * secondEigenY) / singularValue2
  const secondLeftNorm = Math.hypot(secondLeftX, secondLeftY)
  if (secondLeftNorm > 0) {
    secondLeftX /= secondLeftNorm
    secondLeftY /= secondLeftNorm
  } else {
    secondLeftX = -firstLeftY
    secondLeftY = firstLeftX
  }

  return {
    left: [firstLeftX, secondLeftX, firstLeftY, secondLeftY],
    singular: [singularValue1, singularValue2],
    right: [firstEigenX, secondEigenX, firstEigenY, secondEigenY]
  }
}

/**
 * Warps an RGB image with a 2x3 affine matrix using inverse mapping and
 * bilinear interpolation, matching cv2.warpAffine with borderValue=0.
 *
 * @param sourcePixels RGB pixel data (row-major, width*height*3 bytes)
 * @param sourceWidth source image width
 * @param sourceHeight source image height
 * @param affineMatrix forward 2x3 affine matrix (row-major)
 * @param outputWidth output width
 * @param outputHeight output height
 * @param borderValue value used for out-of-bounds samples
 * @returns warped RGB pixels with shape outputWidth*outputHeight*3
 */
export function warpAffine(
  sourcePixels: ArrayLike<number>,
  sourceWidth: number,
  sourceHeight: number,
  affineMatrix: AffineMatrix,
  outputWidth = 112,
  outputHeight = 112,
  borderValue = 0
): Uint8Array {
  const determinant =
    affineMatrix[0] * affineMatrix[4] - affineMatrix[1] * affineMatrix[3]
  if (determinant === 0) {
    return new Uint8Array(outputWidth * outputHeight * 3).fill(borderValue)
  }

  const inverse00 = affineMatrix[4] / determinant
  const inverse01 = -affineMatrix[1] / determinant
  const inverse02 =
    (affineMatrix[1] * affineMatrix[5] - affineMatrix[4] * affineMatrix[2]) /
    determinant
  const inverse10 = -affineMatrix[3] / determinant
  const inverse11 = affineMatrix[0] / determinant
  const inverse12 =
    (affineMatrix[3] * affineMatrix[2] - affineMatrix[0] * affineMatrix[5]) /
    determinant

  const output = new Uint8Array(outputWidth * outputHeight * 3)
  const isInBounds = (x: number, y: number): boolean =>
    x >= 0 && x < sourceWidth && y >= 0 && y < sourceHeight

  for (let y = 0; y < outputHeight; y++) {
    for (let x = 0; x < outputWidth; x++) {
      const sourceX = inverse00 * x + inverse01 * y + inverse02
      const sourceY = inverse10 * x + inverse11 * y + inverse12

      const sampleX0 = Math.floor(sourceX)
      const sampleY0 = Math.floor(sourceY)
      const fractionX = sourceX - sampleX0
      const fractionY = sourceY - sampleY0

      const weightTopLeft = (1 - fractionX) * (1 - fractionY)
      const weightTopRight = fractionX * (1 - fractionY)
      const weightBottomLeft = (1 - fractionX) * fractionY
      const weightBottomRight = fractionX * fractionY

      const outputIndex = (y * outputWidth + x) * 3
      for (let channel = 0; channel < 3; channel++) {
        const sampleTopLeft = isInBounds(sampleX0, sampleY0)
          ? sourcePixels[(sampleY0 * sourceWidth + sampleX0) * 3 + channel]
          : borderValue
        const sampleTopRight = isInBounds(sampleX0 + 1, sampleY0)
          ? sourcePixels[
              (sampleY0 * sourceWidth + (sampleX0 + 1)) * 3 + channel
            ]
          : borderValue
        const sampleBottomLeft = isInBounds(sampleX0, sampleY0 + 1)
          ? sourcePixels[
              ((sampleY0 + 1) * sourceWidth + sampleX0) * 3 + channel
            ]
          : borderValue
        const sampleBottomRight = isInBounds(sampleX0 + 1, sampleY0 + 1)
          ? sourcePixels[
              ((sampleY0 + 1) * sourceWidth + (sampleX0 + 1)) * 3 + channel
            ]
          : borderValue

        const interpolatedValue =
          sampleTopLeft * weightTopLeft +
          sampleTopRight * weightTopRight +
          sampleBottomLeft * weightBottomLeft +
          sampleBottomRight * weightBottomRight
        output[outputIndex + channel] = Math.max(
          0,
          Math.min(255, Math.round(interpolatedValue))
        )
      }
    }
  }

  return output
}
