export interface RocPoint {
  far: number
  tpr: number
}

export interface AccuracyMetrics {
  tarAtFar001: number
  tarAtFar01: number
  tarAtFar1: number
  eer: number
  auc: number
  rocPoints: RocPoint[]
}

/**
 * Calculates the ROC curve from similarity scores and labels
 *
 * Sorts similarities descending, then computes TPR and FPR at each threshold.
 *
 * @param similarities - Array of similarity scores (typically -1 to 1)
 * @param labels - Ground truth labels (1 = same person, 0 = different)
 * @returns Array of ROC points sorted by FAR ascending
 */
export function calculateROC(
  similarities: number[],
  labels: number[]
): RocPoint[] {
  if (similarities.length !== labels.length) {
    throw new Error(
      `Length mismatch: similarities (${similarities.length}) vs labels (${labels.length})`
    )
  }

  if (similarities.length === 0) {
    return []
  }

  // Pair and sort by similarity descending
  const paired = similarities
    .map((sim, i) => ({ sim, label: labels[i] }))
    .sort((a, b) => b.sim - a.sim)

  const totalPos = paired.filter(p => p.label === 1).length
  const totalNeg = paired.filter(p => p.label === 0).length

  if (totalPos === 0 || totalNeg === 0) {
    throw new Error(
      `Dataset must contain both positive (${totalPos}) and negative (${totalNeg}) pairs`
    )
  }

  const rocPoints: RocPoint[] = []
  let tp = 0
  let fp = 0

  for (const item of paired) {
    if (item.label === 1) {
      tp++
    } else {
      fp++
    }

    const tpr = tp / totalPos
    const fpr = fp / totalNeg

    rocPoints.push({ far: fpr, tpr })
  }

  return rocPoints
}

/**
 * Calculates TAR (True Acceptance Rate) at a specific FAR threshold
 *
 * Finds the highest TPR where FAR <= targetFar.
 *
 * @param rocPoints - Array of ROC points from calculateROC()
 * @param targetFar - Target False Acceptance Rate (e.g., 0.001 for 0.1%)
 * @returns TPR at the target FAR, or 0 if no point meets the threshold
 */
export function calculateTarAtFar(
  rocPoints: RocPoint[],
  targetFar: number
): number {
  if (rocPoints.length === 0) {
    return 0
  }

  // Find the point closest to (but not exceeding) targetFar
  let bestTpr = 0

  for (const point of rocPoints) {
    if (point.far <= targetFar) {
      bestTpr = point.tpr
    } else {
      break // ROC is sorted by FAR ascending
    }
  }

  return bestTpr
}

/**
 * Calculates the Equal Error Rate (EER)
 *
 * EER is the point where FAR = FRR (False Rejection Rate = 1 - TPR).
 *
 * @param rocPoints - Array of ROC points from calculateROC()
 * @returns EER value (typically 0-1, lower is better)
 */
export function calculateEER(rocPoints: RocPoint[]): number {
  if (rocPoints.length === 0) {
    return 0
  }

  // Find the point where FAR is closest to (1 - TPR)
  // When multiple points tie, prefer the one with the highest FAR/FRR
  let minDiff = Infinity
  let eer = 0

  for (const point of rocPoints) {
    const frr = 1 - point.tpr
    const diff = Math.abs(point.far - frr)

    if (diff < minDiff || (diff === minDiff && (point.far + frr) / 2 > eer)) {
      minDiff = diff
      eer = (point.far + frr) / 2
    }
  }

  return eer
}

/**
 * Calculates the Area Under the ROC Curve (AUC)
 *
 * Uses the trapezoidal rule for numerical integration.
 *
 * @param rocPoints - Array of ROC points from calculateROC()
 * @returns AUC value (0-1, 0.5 = random, 1 = perfect)
 */
export function calculateAUC(rocPoints: RocPoint[]): number {
  if (rocPoints.length < 2) {
    return 0.5
  }

  let auc = 0

  for (let i = 1; i < rocPoints.length; i++) {
    const prev = rocPoints[i - 1]
    const curr = rocPoints[i]

    // Trapezoid area: (x2 - x1) * (y1 + y2) / 2
    const width = curr.far - prev.far
    const avgHeight = (prev.tpr + curr.tpr) / 2
    auc += width * avgHeight
  }

  return auc
}

/**
 * Calculates all accuracy metrics at once
 *
 * Convenience wrapper around the individual metric functions.
 *
 * @param similarities - Array of similarity scores
 * @param labels - Ground truth labels (1 = same, 0 = different)
 * @returns All accuracy metrics including ROC points
 */
export function calculateAllMetrics(
  similarities: number[],
  labels: number[]
): AccuracyMetrics {
  const rocPoints = calculateROC(similarities, labels)

  return {
    tarAtFar001: calculateTarAtFar(rocPoints, 0.001),
    tarAtFar01: calculateTarAtFar(rocPoints, 0.01),
    tarAtFar1: calculateTarAtFar(rocPoints, 0.1),
    eer: calculateEER(rocPoints),
    auc: calculateAUC(rocPoints),
    rocPoints
  }
}
