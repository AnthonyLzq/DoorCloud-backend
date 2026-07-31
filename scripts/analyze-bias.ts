import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Deterministic PRNG (mulberry32) for reproducible sampling — same algorithm
// used in the benchmark cross-validation (section 2.6)
const SEED = 42
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    // biome-ignore lint/style/useShorthandAssign: should not matter
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = mulberry32(SEED)

interface DemographicResult {
  model: string
  group: string
  auc: number
  eer: number
  tarAtFar001: number
  pairs: number
}

function loadDemographicResults(): DemographicResult[] {
  const path = resolve(
    process.cwd(),
    'metrics/demographics/demographics-results.csv'
  )
  if (!readFileSync) return []
  let raw: string
  try {
    raw = readFileSync(path, 'utf-8')
  } catch {
    console.error(
      '[analyze] WARNING: metrics/demographics/demographics-results.csv not found, skipping A.9'
    )
    return []
  }
  const lines = raw.split('\n').filter(l => l.trim().length > 0)
  const results: DemographicResult[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    if (cols.length < 6) continue
    results.push({
      model: cols[0],
      group: cols[1],
      auc: parseFloat(cols[2]),
      eer: parseFloat(cols[3]),
      tarAtFar001: parseFloat(cols[4]),
      pairs: parseInt(cols[5], 10)
    })
  }
  return results
}

// Map demographic CSV group codes (A_F, W_M) to BFW group names
const GROUP_CODE_MAP: Record<string, string> = {
  A_F: 'asian_females',
  A_M: 'asian_males',
  B_F: 'black_females',
  B_M: 'black_males',
  I_F: 'indian_females',
  I_M: 'indian_males',
  W_F: 'white_females',
  W_M: 'white_males'
}

const MODELS = [
  'dlib',
  'insightface-buffalo-s',
  'insightface-buffalo-l',
  'insightface-buffalo-m',
  'vladmandic-human'
] as const

const GROUPS = [
  'asian_females',
  'asian_males',
  'black_females',
  'black_males',
  'indian_females',
  'indian_males',
  'white_females',
  'white_males'
] as const

type Embedding = number[]

interface GroupStats {
  count: number
  centroid: Embedding
  meanIntraSimilarity: number
  stdIntraSimilarity: number
  meanMagnitude: number
  varPerDimension: number[]
}

interface ModelResult {
  model: string
  dim: number
  total: number
  groups: Record<string, GroupStats>
  interGroupSimilarity: number[][]
  nnAccuracy: number
  nnByGroup: Record<string, { same: number; other: number }>
}

// ---------- helpers ----------

function cosineSim(a: Embedding, b: Embedding): number {
  let dotProduct = 0,
    normA = 0,
    normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  return denominator === 0 ? 0 : dotProduct / denominator
}

function magnitude(embedding: Embedding): number {
  let sumOfSquares = 0
  for (let i = 0; i < embedding.length; i++)
    sumOfSquares += embedding[i] * embedding[i]
  return Math.sqrt(sumOfSquares)
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

function std(values: number[], meanValue: number): number {
  if (values.length < 2) return 0
  const sumSquaredDeviations = values.reduce(
    (a, b) => a + (b - meanValue) ** 2,
    0
  )
  return Math.sqrt(sumSquaredDeviations / (values.length - 1))
}

// Incremental variance update (Welford)
function updateWelford(
  sampleCount: number,
  runningMean: Embedding,
  squaredDeviations: Embedding,
  embedding: Embedding
): { mean: Embedding; squaredDeviations: Embedding } {
  const updatedMean = [...runningMean]
  const updatedSquaredDeviations = [...squaredDeviations]
  for (let i = 0; i < embedding.length; i++) {
    const delta = embedding[i] - updatedMean[i]
    updatedMean[i] += delta / sampleCount
    const updatedDelta = embedding[i] - updatedMean[i]
    updatedSquaredDeviations[i] += delta * updatedDelta
  }
  return { mean: updatedMean, squaredDeviations: updatedSquaredDeviations }
}

// PCA via power iteration on the centered group means (groupCount × dim)
function computePCA(
  groupMeans: Record<string, Embedding>,
  dim: number
): {
  pc1: number[]
  pc2: number[]
  explained: number[]
} {
  const groupLabels = Object.keys(groupMeans)
  const groupCount = groupLabels.length
  if (groupCount === 0) return { pc1: [], pc2: [], explained: [] }

  // Build centered data matrix (groupCount × dim)
  const centeredData: number[][] = []
  const columnMeans = new Array(dim).fill(0)
  for (const label of groupLabels) {
    const groupMean = groupMeans[label]
    centeredData.push([...groupMean])
    for (let i = 0; i < dim; i++) columnMeans[i] += groupMean[i]
  }
  for (let i = 0; i < dim; i++) columnMeans[i] /= groupCount
  for (const row of centeredData) {
    for (let i = 0; i < dim; i++) row[i] -= columnMeans[i]
  }

  // For 8 groups, power iteration on the 8×8 Gram matrix is cheaper
  // Gram matrix G = (1/groupCount) * X * X^T
  const gramMatrix: number[][] = Array.from({ length: groupCount }, () =>
    new Array(groupCount).fill(0)
  )
  for (let i = 0; i < groupCount; i++) {
    for (let j = 0; j < groupCount; j++) {
      let sum = 0
      for (let d = 0; d < dim; d++)
        sum += centeredData[i][d] * centeredData[j][d]
      gramMatrix[i][j] = sum / groupCount
    }
  }

  // Power iteration for top 2 eigenvectors of the Gram matrix
  function powerIterate(
    matrix: number[][],
    componentCount: number
  ): number[][] {
    const eigenvectors: number[][] = []
    for (let comp = 0; comp < componentCount; comp++) {
      let candidate = new Array(groupCount).fill(0).map(() => rng() - 0.5)

      for (let iter = 0; iter < 200; iter++) {
        // Orthogonalize against previous components
        for (const previousVector of eigenvectors) {
          let dotProduct = 0,
            previousNorm = 0

          for (let i = 0; i < groupCount; i++) {
            dotProduct += candidate[i] * previousVector[i]
            previousNorm += previousVector[i] * previousVector[i]
          }

          const projectionFactor = dotProduct / Math.sqrt(previousNorm)

          for (let i = 0; i < groupCount; i++)
            candidate[i] -= projectionFactor * previousVector[i]
        }

        // candidate = matrix * candidate
        const nextVector = new Array(groupCount).fill(0)

        for (let i = 0; i < groupCount; i++) {
          for (let j = 0; j < groupCount; j++)
            nextVector[i] += matrix[i][j] * candidate[j]
        }

        // Normalize
        let norm = 0

        for (let i = 0; i < groupCount; i++)
          norm += nextVector[i] * nextVector[i]

        norm = Math.sqrt(norm)

        if (norm < 1e-10) break

        for (let i = 0; i < groupCount; i++) candidate[i] = nextVector[i] / norm

        if (iter > 10) {
          // Check convergence
          let convergenceDelta = 0

          for (let i = 0; i < groupCount; i++)
            convergenceDelta += nextVector[i] - candidate[i]

          if (Math.abs(convergenceDelta) < 1e-6) break
        }
      }
      eigenvectors.push([...candidate])
    }
    return eigenvectors
  }

  const eigenvectors = powerIterate(gramMatrix, 2)

  // Map eigenvectors back to original space: PC = X^T * v (as unit vector)
  function toOriginalSpace(eigenvector: number[]): number[] {
    const principalComponent = new Array(dim).fill(0)
    for (let d = 0; d < dim; d++) {
      for (let i = 0; i < groupCount; i++)
        principalComponent[d] += centeredData[i][d] * eigenvector[i]
    }
    let norm = 0
    for (let d = 0; d < dim; d++)
      norm += principalComponent[d] * principalComponent[d]
    norm = Math.sqrt(norm)
    if (norm > 1e-10)
      for (let d = 0; d < dim; d++) principalComponent[d] /= norm
    return principalComponent
  }

  // Compute explained variance
  const principalComponent1 = toOriginalSpace(eigenvectors[0])
  const principalComponent2 = toOriginalSpace(eigenvectors[1])

  let totalVariance = 0
  for (let i = 0; i < groupCount; i++) {
    for (let d = 0; d < dim; d++)
      totalVariance += centeredData[i][d] * centeredData[i][d]
  }
  totalVariance /= groupCount

  // Eigenvalue = v^T * G * v
  function eigenvalue(eigenvector: number[]): number {
    let eigenvalueValue = 0
    for (let i = 0; i < groupCount; i++) {
      let sum = 0
      for (let j = 0; j < groupCount; j++)
        sum += gramMatrix[i][j] * eigenvector[j]
      eigenvalueValue += eigenvector[i] * sum
    }
    return Math.max(0, eigenvalueValue)
  }

  const eigenvalue1 = eigenvalue(eigenvectors[0])
  const eigenvalue2 = eigenvalue(eigenvectors[1])
  const explained = [
    eigenvalue1 / Math.max(totalVariance, 1e-10),
    eigenvalue2 / Math.max(totalVariance, 1e-10)
  ]

  return { pc1: principalComponent1, pc2: principalComponent2, explained }
}

// ---------- nearest neighbor (stratified sample) ----------
function analyzeNN(
  embeddingsByGroup: Record<string, Embedding[]>,
  sampleSize: number
): {
  accuracy: number
  byGroup: Record<string, { same: number; other: number }>
} {
  const nnCountsByGroup: Record<string, { same: number; other: number }> = {}
  for (const group of GROUPS) nnCountsByGroup[group] = { same: 0, other: 0 }

  // Flatten all embeddings with their group labels
  const allSamples: { embedding: Embedding; group: string }[] = []
  for (const group of GROUPS) {
    const groupEmbeddings = embeddingsByGroup[group] || []
    allSamples.push(...groupEmbeddings.map(embedding => ({ embedding, group })))
  }
  if (allSamples.length === 0) return { accuracy: 0, byGroup: nnCountsByGroup }

  // Sample from each group
  let totalCorrect = 0
  let totalSample = 0
  for (const group of GROUPS) {
    const groupEmbeddings = embeddingsByGroup[group] || []
    const sampleCount = Math.min(sampleSize, groupEmbeddings.length)
    const sampleIndices = new Set<number>()
    while (sampleIndices.size < sampleCount) {
      sampleIndices.add(Math.floor(rng() * groupEmbeddings.length))
    }
    for (const sampleIndex of sampleIndices) {
      const queryEmbedding = groupEmbeddings[sampleIndex]
      let bestSimilarity = -Infinity
      let bestGroup = ''
      // Search all groups (excluding self for accuracy)
      for (const [otherGroup, otherEmbeddings] of Object.entries(
        embeddingsByGroup
      )) {
        const startOffset = otherGroup === group ? 1 : 0
        for (let j = startOffset; j < otherEmbeddings.length; j++) {
          // Skip the exact same embedding in the same group
          if (otherGroup === group && j === sampleIndex) continue
          const similarity = cosineSim(queryEmbedding, otherEmbeddings[j])
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity
            bestGroup = otherGroup
          }
        }
      }
      if (bestGroup === group) {
        totalCorrect++
        nnCountsByGroup[group].same++
      } else {
        nnCountsByGroup[group].other++
      }
      totalSample++
    }
  }

  return {
    accuracy: totalCorrect / Math.max(totalSample, 1),
    byGroup: nnCountsByGroup
  }
}

// ---------- main ----------
function analyzeModel(
  model: string,
  data: Record<string, Embedding>
): ModelResult {
  const embeddingsByGroup: Record<string, Embedding[]> = {}
  for (const group of GROUPS) embeddingsByGroup[group] = []

  const embeddingKeys = Object.keys(data)
  const dim = embeddingKeys.length > 0 ? data[embeddingKeys[0]].length : 0

  // Distribute by group
  for (const key of embeddingKeys) {
    const group = GROUPS.find(g => key.startsWith(g)) || 'unknown'
    if (!embeddingsByGroup[group]) embeddingsByGroup[group] = []
    embeddingsByGroup[group].push(data[key])
  }

  // Compute per-group stats with Welford
  const groupStats: Record<string, GroupStats> = {}
  const interGroupSimilarityMatrix: number[][] = GROUPS.map(() =>
    new Array(GROUPS.length).fill(0)
  )

  for (const [groupIndex, group] of GROUPS.entries()) {
    const groupEmbeddings = embeddingsByGroup[group] || []
    const count = groupEmbeddings.length
    if (count === 0) {
      groupStats[group] = {
        count: 0,
        centroid: [],
        meanIntraSimilarity: 0,
        stdIntraSimilarity: 0,
        meanMagnitude: 0,
        varPerDimension: []
      }
      continue
    }

    // Incremental centroid & variance
    let groupCentroid = groupEmbeddings[0]
    let runningMean = [...groupEmbeddings[0]]
    let runningSquaredDeviations = new Array(dim).fill(0)
    let sampleCount = 1
    for (let i = 1; i < groupEmbeddings.length; i++) {
      sampleCount++
      const welfordUpdate = updateWelford(
        sampleCount,
        runningMean,
        runningSquaredDeviations,
        groupEmbeddings[i]
      )
      runningMean = welfordUpdate.mean
      runningSquaredDeviations = welfordUpdate.squaredDeviations
    }
    groupCentroid = runningMean

    // Intra-group similarities
    const intraSimilarities: number[] = []
    const magnitudes: number[] = []
    for (const embedding of groupEmbeddings) {
      intraSimilarities.push(cosineSim(embedding, groupCentroid))
      magnitudes.push(magnitude(embedding))
    }
    const meanIntraSimilarity = mean(intraSimilarities)
    const stdIntraSimilarity = std(intraSimilarities, meanIntraSimilarity)
    const variancePerDimension = runningSquaredDeviations.map(
      squaredDeviation => squaredDeviation / Math.max(count - 1, 1)
    )

    groupStats[group] = {
      count,
      centroid: groupCentroid,
      meanIntraSimilarity,
      stdIntraSimilarity,
      meanMagnitude: mean(magnitudes),
      varPerDimension: variancePerDimension
    }
  }

  // Inter-group similarity matrix (centroid cosine)
  for (let i = 0; i < GROUPS.length; i++) {
    for (let j = 0; j < GROUPS.length; j++) {
      const centroidI = groupStats[GROUPS[i]].centroid
      const centroidJ = groupStats[GROUPS[j]].centroid
      interGroupSimilarityMatrix[i][j] =
        centroidI.length && centroidJ.length
          ? cosineSim(centroidI, centroidJ)
          : 0
    }
  }

  // Nearest neighbor analysis (stratified sample)
  const nearestNeighborResult = analyzeNN(embeddingsByGroup, 200)

  return {
    model,
    dim,
    total: embeddingKeys.length,
    groups: groupStats,
    interGroupSimilarity: interGroupSimilarityMatrix,
    nnAccuracy: nearestNeighborResult.accuracy,
    nnByGroup: nearestNeighborResult.byGroup
  }
}

// ---------- appendix ----------
const GROUP_DISPLAY = (g: string) => {
  const spaced = g.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function generateAppendix(results: ModelResult[]): string {
  const lines: string[] = []

  lines.push('## Appendix A: Detailed Demographic Bias Results')
  lines.push('')
  lines.push(
    'Per-model results from the BFW analysis. LaTeX equivalents of these tables are in `metrics/tables/` for direct inclusion in a thesis document.'
  )
  lines.push('')

  // A.1 Cross-model comparison
  const verificationResults = loadDemographicResults()
  lines.push('### A.1 Cross-Model Comparison')
  lines.push('')
  lines.push(
    '| Model | Dim | NN Acc | Intra-range (Δ) | Verification AUC range (Δ) | Best group | Worst group |'
  )
  lines.push(
    '|-------|-----|--------|-----------------|---------------------------|-----------|-------------|'
  )
  for (const modelResult of results) {
    const similarities = GROUPS.map(
      g => modelResult.groups[g]?.meanIntraSimilarity ?? 0
    )
    const minSimilarity = Math.min(...similarities)
    const maxSimilarity = Math.max(...similarities)
    // Best/worst from verification AUC when available, else cohesion
    let bestGroup = GROUP_DISPLAY(GROUPS[similarities.indexOf(maxSimilarity)])
    let worstGroup = GROUP_DISPLAY(GROUPS[similarities.indexOf(minSimilarity)])
    let verificationRange = '—'
    if (verificationResults.length > 0) {
      const modelDemoResults = verificationResults.filter(
        d => d.model === modelResult.model
      )
      if (modelDemoResults.length > 0) {
        const aucValues = modelDemoResults.map(e => e.auc)
        const minAuc = Math.min(...aucValues)
        const maxAuc = Math.max(...aucValues)
        verificationRange = `${minAuc.toFixed(4)}–${maxAuc.toFixed(4)} (**${(maxAuc - minAuc).toFixed(4)}**)`
        const minAucGroupCode =
          modelDemoResults.find(e => e.auc === minAuc)?.group ?? ''
        const maxAucGroupCode =
          modelDemoResults.find(e => e.auc === maxAuc)?.group ?? ''
        if (GROUP_CODE_MAP[minAucGroupCode])
          worstGroup = GROUP_DISPLAY(GROUP_CODE_MAP[minAucGroupCode])
        if (GROUP_CODE_MAP[maxAucGroupCode])
          bestGroup = GROUP_DISPLAY(GROUP_CODE_MAP[maxAucGroupCode])
      }
    }
    lines.push(
      `| ${modelResult.model} | ${modelResult.dim}d | ${(modelResult.nnAccuracy * 100).toFixed(1)}% | ` +
        `${(minSimilarity * 100).toFixed(1)}%–${(maxSimilarity * 100).toFixed(1)}% (Δ=${((maxSimilarity - minSimilarity) * 100).toFixed(2)}%) | ` +
        `${verificationRange} | ${bestGroup} | ${worstGroup} |`
    )
  }
  lines.push('')

  // A.2..A.6 Per-model detail
  const sectionLabels = ['A.2', 'A.3', 'A.4', 'A.5', 'A.6']
  for (let modelIndex = 0; modelIndex < results.length; modelIndex++) {
    const modelResult = results[modelIndex]
    lines.push(
      `### ${sectionLabels[modelIndex]} ${modelResult.model} (${modelResult.dim}D)`
    )
    lines.push('')
    lines.push(
      `- **Total embeddings:** ${modelResult.total.toLocaleString()} | **NN accuracy:** ${(modelResult.nnAccuracy * 100).toFixed(1)}%`
    )
    lines.push('')
    lines.push(
      '| Group | Count | Mean Intra-Sim | Std Intra-Sim | Mean Magnitude | Variance (mean) |'
    )
    lines.push(
      '|-------|-------|----------------|---------------|----------------|-----------------|'
    )
    for (const group of GROUPS) {
      const groupStats = modelResult.groups[group]
      if (!groupStats || groupStats.count === 0) {
        lines.push(`| ${group} | 0 | — | — | — | — |`)
        continue
      }
      const meanVariance = mean(groupStats.varPerDimension)
      lines.push(
        `| ${group} | ${groupStats.count} | ${(groupStats.meanIntraSimilarity * 100).toFixed(2)}% | ` +
          `${(groupStats.stdIntraSimilarity * 100).toFixed(2)}% | ` +
          `${groupStats.meanMagnitude.toFixed(4)} | ${meanVariance.toExponential(3)} |`
      )
    }
    lines.push('')

    // Bias indicators for this model
    const similarities = GROUPS.map(
      g => modelResult.groups[g]?.meanIntraSimilarity ?? 0
    )
    const minSimilarity = Math.min(...similarities)
    const maxSimilarity = Math.max(...similarities)
    let maxInterSimilarity = -Infinity
    let minInterSimilarity = Infinity
    let closestPair = ''
    let farthestPair = ''
    for (let i = 0; i < GROUPS.length; i++) {
      for (let j = i + 1; j < GROUPS.length; j++) {
        const interSimilarity = modelResult.interGroupSimilarity[i][j]
        if (interSimilarity > maxInterSimilarity) {
          maxInterSimilarity = interSimilarity
          closestPair = `${GROUP_DISPLAY(GROUPS[i])}↔${GROUP_DISPLAY(GROUPS[j])}`
        }
        if (interSimilarity < minInterSimilarity) {
          minInterSimilarity = interSimilarity
          farthestPair = `${GROUP_DISPLAY(GROUPS[i])}↔${GROUP_DISPLAY(GROUPS[j])}`
        }
      }
    }
    lines.push(
      `**Bias indicators:** Intra-range Δ=${((maxSimilarity - minSimilarity) * 100).toFixed(2)}% (${(minSimilarity * 100).toFixed(2)}%–${(maxSimilarity * 100).toFixed(2)}%). Highest cohesion: ${GROUP_DISPLAY(GROUPS[similarities.indexOf(maxSimilarity)])}. Lowest: ${GROUP_DISPLAY(GROUPS[similarities.indexOf(minSimilarity)])}. Closest groups: ${closestPair} (${(maxInterSimilarity * 100).toFixed(1)}%). Farthest: ${farthestPair} (${(minInterSimilarity * 100).toFixed(1)}%).`
    )
    lines.push('')
  }

  // A.7 NN accuracy by group (consolidated)
  lines.push('### A.7 NN Accuracy by Group')
  lines.push('')
  lines.push('| Group | ' + results.map(r => r.model).join(' | ') + ' |')
  lines.push('|-------|' + results.map(() => '-------').join('|') + '|')
  for (const group of GROUPS) {
    const accuracyRow = results.map(modelResult => {
      const nnCounts = modelResult.nnByGroup[group]
      if (!nnCounts || nnCounts.same + nnCounts.other === 0) return '—'
      return (
        (
          (nnCounts.same / Math.max(nnCounts.same + nnCounts.other, 1)) *
          100
        ).toFixed(1) + '%'
      )
    })
    lines.push(`| ${group} | ${accuracyRow.join(' | ')} |`)
  }
  lines.push('')

  // A.8 PCA of group centroids
  lines.push('### A.8 PCA of Group Centroids')
  lines.push('')
  lines.push(
    'Figure 6 (`metrics/figures/figure06-pca-centroids.png`) shows the PCA projection of the 8 group centroids for each model.'
  )
  lines.push('')
  for (const modelResult of results) {
    lines.push(`**${modelResult.model}**`)
    lines.push('')
    const centroids: Record<string, Embedding> = {}
    for (const group of GROUPS) {
      if (modelResult.groups[group]?.centroid.length)
        centroids[group] = modelResult.groups[group].centroid
    }
    const pca = computePCA(centroids, modelResult.dim)
    if (pca.pc1.length === 0) {
      lines.push('*PCA not available*')
      lines.push('')
      continue
    }
    lines.push(
      `| Group | PC1 | PC2 | Explained: PC1=${(pca.explained[0] * 100).toFixed(1)}%, PC2=${(pca.explained[1] * 100).toFixed(1)}% |`
    )
    lines.push('|-------|-----|-----|-----------|')
    for (const group of GROUPS) {
      if (!centroids[group]) continue
      const centroid = centroids[group]
      let projection1 = 0,
        projection2 = 0
      for (let d = 0; d < centroid.length; d++) {
        projection1 += centroid[d] * pca.pc1[d]
        projection2 += centroid[d] * pca.pc2[d]
      }
      lines.push(
        `| ${group} | ${projection1.toExponential(4)} | ${projection2.toExponential(4)} | |`
      )
    }
    lines.push('')
  }

  // A.9 Verification metrics by group (from analyze-demographics)
  const demographicResults = loadDemographicResults()
  if (verificationResults.length > 0) {
    lines.push('### A.9 Verification Accuracy by Group (AUC)')
    lines.push('')
    lines.push(
      'Per-group verification metrics computed from the BFW pair dataset (923,898 pairs) by `scripts/analyze-demographics.ts`. AUC is the canonical bias metric: the range across groups measures how evenly the model verifies identities across demographics.'
    )
    lines.push('')

    const demographicModels = MODELS.filter(model =>
      demographicResults.some(result => result.model === model)
    )
    lines.push('| Group | ' + demographicModels.join(' | ') + ' |')
    lines.push(
      '|-------|' + demographicModels.map(() => '-------').join('|') + '|'
    )
    for (const group of GROUPS) {
      const groupCode = Object.keys(GROUP_CODE_MAP).find(
        code => GROUP_CODE_MAP[code] === group
      )
      const aucRow = demographicModels.map(model => {
        const result = demographicResults.find(
          d => d.model === model && d.group === groupCode
        )
        return result ? result.auc.toFixed(4) : '—'
      })
      lines.push(`| ${group} | ${aucRow.join(' | ')} |`)
    }
    lines.push('')

    // Range per model
    lines.push(
      '| **Range (Δ)** | ' +
        demographicModels
          .map(model => {
            const modelResults = demographicResults.filter(
              d => d.model === model
            )
            if (modelResults.length === 0) return '—'
            const aucValues = modelResults.map(result => result.auc)
            return (Math.max(...aucValues) - Math.min(...aucValues)).toFixed(4)
          })
          .join(' | ') +
        ' |'
    )
    lines.push('')
  }

  lines.push('---')
  lines.push(
    `_Appendix A generated by scripts/analyze-bias.ts — ${new Date().toISOString()}_`
  )
  lines.push('')

  return lines.join('\n')
}

// ---------- main entry ----------
async function main() {
  console.error('[analyze] Loading embeddings...')

  const modelResults: ModelResult[] = []
  for (const model of MODELS) {
    const embeddingPath = resolve(
      process.cwd(),
      'metrics/embeddings',
      `${model}.json`
    )
    console.error(`[analyze] Loading ${model}...`)
    const rawData = readFileSync(embeddingPath, 'utf-8')
    const embeddingsByPath: Record<string, Embedding> = JSON.parse(rawData)
    console.error(
      `[analyze] ${model}: ${Object.keys(embeddingsByPath).length} embeddings, ${embeddingsByPath[Object.keys(embeddingsByPath)[0]].length}d`
    )

    console.error(`[analyze] Analyzing ${model}...`)
    const modelResult = analyzeModel(model, embeddingsByPath)
    modelResults.push(modelResult)

    // Log quick summary
    const similarities = GROUPS.map(
      g => modelResult.groups[g]?.meanIntraSimilarity ?? 0
    )
    const minSimilarityPct = (Math.min(...similarities) * 100).toFixed(1)
    const maxSimilarityPct = (Math.max(...similarities) * 100).toFixed(1)
    console.error(
      `[analyze] ${model} done. Intra-sim range: ${minSimilarityPct}% – ${maxSimilarityPct}%. NN acc: ${(modelResult.nnAccuracy * 100).toFixed(1)}%`
    )
  }

  console.error('[analyze] Generating Appendix A...')
  const appendixMarkdown = generateAppendix(modelResults)

  const docPath = resolve(process.cwd(), 'docs/benchmark-analysis.md')
  const documentContent = readFileSync(docPath, 'utf-8')
  const appendixStartIndex = documentContent.indexOf('## Appendix A')
  const referencesStartIndex = documentContent.indexOf(
    '## References',
    appendixStartIndex
  )
  if (appendixStartIndex === -1 || referencesStartIndex === -1) {
    console.error(
      'FATAL: Could not find "## Appendix A" or "## References" markers in docs/benchmark-analysis.md'
    )
    process.exit(1)
  }
  const updatedDocument =
    documentContent.slice(0, appendixStartIndex) +
    appendixMarkdown +
    '\n' +
    documentContent.slice(referencesStartIndex)
  writeFileSync(docPath, updatedDocument, 'utf-8')
  console.error(`[analyze] Appendix A updated in ${docPath}`)
}

main().catch(e => {
  console.error(`FATAL: ${e.message}`)
  process.exit(1)
})
