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
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = mulberry32(SEED)

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
  let dot = 0,
    na = 0,
    nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

function magnitude(v: Embedding): number {
  let s = 0
  for (let i = 0; i < v.length; i++) s += v[i] * v[i]
  return Math.sqrt(s)
}

function mean(vs: number[]): number {
  return vs.reduce((a, b) => a + b, 0) / vs.length
}

function std(vs: number[], m: number): number {
  if (vs.length < 2) return 0
  const sq = vs.reduce((a, b) => a + (b - m) ** 2, 0)
  return Math.sqrt(sq / (vs.length - 1))
}

function addToCentroid(
  centroid: Embedding,
  v: Embedding,
  count: number
): Embedding {
  if (count === 1) return [...v]
  const c = [...centroid]
  for (let i = 0; i < c.length; i++) {
    c[i] = c[i] + (v[i] - c[i]) / count
  }
  return c
}

// Incremental variance update (Welford)
function updateWelford(
  count: number,
  mean: Embedding,
  m2: Embedding,
  v: Embedding
): { mean: Embedding; m2: Embedding } {
  const nm = [...mean]
  const nm2 = [...m2]
  for (let i = 0; i < v.length; i++) {
    const delta = v[i] - nm[i]
    nm[i] += delta / count
    const delta2 = v[i] - nm[i]
    nm2[i] += delta * delta2
  }
  return { mean: nm, m2: nm2 }
}

// PCA via randomized SVD on the centered group means (8 groups × dim)
function computePCA(
  groupMeans: Record<string, Embedding>,
  dim: number
): { pc1: number[]; pc2: number[]; explained: number[] } {
  const labels = Object.keys(groupMeans)
  const k = labels.length
  if (k === 0) return { pc1: [], pc2: [], explained: [] }

  // Build data matrix (k × dim) and center
  const data: number[][] = []
  const colMean = new Array(dim).fill(0)
  for (const label of labels) {
    const v = groupMeans[label]
    data.push([...v])
    for (let i = 0; i < dim; i++) colMean[i] += v[i]
  }
  for (let i = 0; i < dim; i++) colMean[i] /= k
  for (const row of data) {
    for (let i = 0; i < dim; i++) row[i] -= colMean[i]
  }

  // For k=8, power iteration on the 8×8 Gram matrix is cheaper
  // Compute Gram matrix G = (1/k) * X * X^T  (k × k)
  const G: number[][] = Array.from({ length: k }, () => new Array(k).fill(0))
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      let s = 0
      for (let d = 0; d < dim; d++) s += data[i][d] * data[j][d]
      G[i][j] = s / k
    }
  }

  // Power iteration for top 2 eigenvectors of G
  function powerIterate(G: number[][], n: number): number[][] {
    const vecs: number[][] = []
    for (let comp = 0; comp < n; comp++) {
      let v = new Array(k).fill(0).map(() => rng() - 0.5)
      for (let iter = 0; iter < 200; iter++) {
        // Orthogonalize against previous components
        for (const prev of vecs) {
          let dot = 0,
            nrm = 0
          for (let i = 0; i < k; i++) {
            dot += v[i] * prev[i]
            nrm += prev[i] * prev[i]
          }
          const factor = dot / Math.sqrt(nrm)
          for (let i = 0; i < k; i++) v[i] -= factor * prev[i]
        }
        // v = G * v
        const nv = new Array(k).fill(0)
        for (let i = 0; i < k; i++) {
          for (let j = 0; j < k; j++) nv[i] += G[i][j] * v[j]
        }
        // Normalize
        let nrm = 0
        for (let i = 0; i < k; i++) nrm += nv[i] * nv[i]
        nrm = Math.sqrt(nrm)
        if (nrm < 1e-10) break
        for (let i = 0; i < k; i++) v[i] = nv[i] / nrm

        if (iter > 10) {
          // Check convergence
          let diff = 0
          for (let i = 0; i < k; i++) diff += nv[i] - v[i]
          if (Math.abs(diff) < 1e-6) break
        }
      }
      vecs.push([...v])
    }
    return vecs
  }

  const eigVecs = powerIterate(G, 2)

  // Map eigenvectors back to original space: PC = X^T * v (as unit vector)
  function toOriginalSpace(eigVec: number[]): number[] {
    const pc = new Array(dim).fill(0)
    for (let d = 0; d < dim; d++) {
      for (let i = 0; i < k; i++) pc[d] += data[i][d] * eigVec[i]
    }
    let nrm = 0
    for (let d = 0; d < dim; d++) nrm += pc[d] * pc[d]
    nrm = Math.sqrt(nrm)
    if (nrm > 1e-10) for (let d = 0; d < dim; d++) pc[d] /= nrm
    return pc
  }

  // Compute explained variance
  const pc1 = toOriginalSpace(eigVecs[0])
  const pc2 = toOriginalSpace(eigVecs[1])

  const projected: number[][] = [new Array(2).fill(0), new Array(2).fill(0)]
  for (let i = 0; i < k; i++) {
    for (let d = 0; d < dim; d++) {
      projected[0][d % 2] += data[i][d] * pc1[d]
    }
  }
  // Actually compute eigenvalue for explained variance
  let totalVar = 0
  for (let i = 0; i < k; i++) {
    for (let d = 0; d < dim; d++) totalVar += data[i][d] * data[i][d]
  }
  totalVar /= k

  // Eigenvalue = v^T * G * v
  function eigenvalue(eigVec: number[]): number {
    let ev = 0
    for (let i = 0; i < k; i++) {
      let s = 0
      for (let j = 0; j < k; j++) s += G[i][j] * eigVec[j]
      ev += eigVec[i] * s
    }
    return Math.max(0, ev)
  }

  const ev1 = eigenvalue(eigVecs[0])
  const ev2 = eigenvalue(eigVecs[1])
  const explained = [
    ev1 / Math.max(totalVar, 1e-10),
    ev2 / Math.max(totalVar, 1e-10)
  ]

  return { pc1, pc2, explained }
}

// ---------- nearest neighbor (stratified sample) ----------
function analyzeNN(
  byGroup: Record<string, Embedding[]>,
  sampleSize: number
): {
  accuracy: number
  byGroup: Record<string, { same: number; other: number }>
} {
  const result: Record<string, { same: number; other: number }> = {}
  for (const g of GROUPS) result[g] = { same: 0, other: 0 }

  // Flatten all embeddings with their group labels
  const all: { emb: Embedding; group: string }[] = []
  for (const g of GROUPS) {
    const embs = byGroup[g] || []
    all.push(...embs.map(emb => ({ emb, group: g })))
  }
  if (all.length === 0) return { accuracy: 0, byGroup: result }

  // Sample from each group
  let totalCorrect = 0
  let totalSample = 0
  for (const g of GROUPS) {
    const embs = byGroup[g] || []
    const n = Math.min(sampleSize, embs.length)
    const indices = new Set<number>()
    while (indices.size < n) {
      indices.add(Math.floor(rng() * embs.length))
    }
    for (const idx of indices) {
      const query = embs[idx]
      let bestSim = -Infinity
      let bestGroup = ''
      // Search all groups (excluding self for accuracy)
      for (const [otherGroup, otherEmbs] of Object.entries(byGroup)) {
        const startOff = otherGroup === g ? 1 : 0
        for (let j = startOff; j < otherEmbs.length; j++) {
          // Skip the exact same embedding in the same group
          if (otherGroup === g && j === idx) continue
          const sim = cosineSim(query, otherEmbs[j])
          if (sim > bestSim) {
            bestSim = sim
            bestGroup = otherGroup
          }
        }
      }
      if (bestGroup === g) {
        totalCorrect++
        result[g].same++
      } else {
        result[g].other++
      }
      totalSample++
    }
  }

  return { accuracy: totalCorrect / Math.max(totalSample, 1), byGroup: result }
}

// ---------- main ----------
function analyzeModel(
  model: string,
  data: Record<string, Embedding>
): ModelResult {
  const byGroup: Record<string, Embedding[]> = {}
  for (const g of GROUPS) byGroup[g] = []

  const keys = Object.keys(data)
  const dim = keys.length > 0 ? data[keys[0]].length : 0

  // Distribute by group
  for (const key of keys) {
    const g = GROUPS.find(g => key.startsWith(g)) || 'unknown'
    if (!byGroup[g]) byGroup[g] = []
    byGroup[g].push(data[key])
  }

  // Compute per-group stats with Welford
  const groups: Record<string, GroupStats> = {}
  const interSim: number[][] = GROUPS.map(() =>
    new Array(GROUPS.length).fill(0)
  )

  for (const [gi, g] of GROUPS.entries()) {
    const embs = byGroup[g] || []
    const count = embs.length
    if (count === 0) {
      groups[g] = {
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
    let centroid = embs[0]
    let welfordMean = [...embs[0]]
    let welfordM2 = new Array(dim).fill(0)
    let n = 1
    for (let i = 1; i < embs.length; i++) {
      n++
      const upd = updateWelford(n, welfordMean, welfordM2, embs[i])
      welfordMean = upd.mean
      welfordM2 = upd.m2
    }
    centroid = welfordMean

    // Intra-group similarities
    const intraSims: number[] = []
    const mags: number[] = []
    for (const emb of embs) {
      intraSims.push(cosineSim(emb, centroid))
      mags.push(magnitude(emb))
    }
    const meanIntra = mean(intraSims)
    const stdIntra = std(intraSims, meanIntra)
    const varPerDim = welfordM2.map(m2 => m2 / Math.max(count - 1, 1))

    groups[g] = {
      count,
      centroid,
      meanIntraSimilarity: meanIntra,
      stdIntraSimilarity: stdIntra,
      meanMagnitude: mean(mags),
      varPerDimension: varPerDim
    }
  }

  // Inter-group similarity matrix (centroid cosine)
  for (let i = 0; i < GROUPS.length; i++) {
    for (let j = 0; j < GROUPS.length; j++) {
      const ci = groups[GROUPS[i]].centroid
      const cj = groups[GROUPS[j]].centroid
      interSim[i][j] = ci.length && cj.length ? cosineSim(ci, cj) : 0
    }
  }

  // Nearest neighbor analysis (stratified sample)
  const nnResult = analyzeNN(byGroup, 200)

  return {
    model,
    dim,
    total: keys.length,
    groups,
    interGroupSimilarity: interSim,
    nnAccuracy: nnResult.accuracy,
    nnByGroup: nnResult.byGroup
  }
}

// ---------- appendix ----------
const GROUP_DISPLAY = (g: string) => g.replace(/_/g, ' ')

function generateAppendix(results: ModelResult[]): string {
  const lines: string[] = []

  lines.push('## Appendix A: Detailed Demographic Bias Results')
  lines.push('')
  lines.push(
    'Per-model results from the BFW analysis. LaTeX equivalents of these tables are in `metrics/tables/` for direct inclusion in a thesis document.'
  )
  lines.push('')

  // A.1 Cross-model comparison
  lines.push('### A.1 Cross-Model Comparison')
  lines.push('')
  lines.push(
    '| Model | Dim | NN Acc | Intra-range (Δ) | Best group | Worst group |'
  )
  lines.push(
    '|-------|-----|--------|-----------------|-----------|-------------|'
  )
  for (const r of results) {
    const sims = GROUPS.map(g => r.groups[g]?.meanIntraSimilarity ?? 0)
    const mn = Math.min(...sims)
    const mx = Math.max(...sims)
    const bestG = GROUP_DISPLAY(GROUPS[sims.indexOf(mx)])
    const worstG = GROUP_DISPLAY(GROUPS[sims.indexOf(mn)])
    lines.push(
      `| ${r.model} | ${r.dim}d | ${(r.nnAccuracy * 100).toFixed(1)}% | ` +
        `${(mn * 100).toFixed(1)}%–${(mx * 100).toFixed(1)}% (Δ=${((mx - mn) * 100).toFixed(2)}%) | ` +
        `${bestG} | ${worstG} |`
    )
  }
  lines.push('')

  // A.2..A.6 Per-model detail
  const sectionLabels = ['A.2', 'A.3', 'A.4', 'A.5', 'A.6']
  for (let mi = 0; mi < results.length; mi++) {
    const r = results[mi]
    lines.push(`### ${sectionLabels[mi]} ${r.model} (${r.dim}D)`)
    lines.push('')
    lines.push(
      `- **Total embeddings:** ${r.total.toLocaleString()} | **NN accuracy:** ${(r.nnAccuracy * 100).toFixed(1)}%`
    )
    lines.push('')
    lines.push(
      '| Group | Count | Mean Intra-Sim | Std Intra-Sim | Mean Magnitude | Variance (mean) |'
    )
    lines.push(
      '|-------|-------|----------------|---------------|----------------|-----------------|'
    )
    for (const g of GROUPS) {
      const s = r.groups[g]
      if (!s || s.count === 0) {
        lines.push(`| ${g} | 0 | — | — | — | — |`)
        continue
      }
      const meanVar = mean(s.varPerDimension)
      lines.push(
        `| ${g} | ${s.count} | ${(s.meanIntraSimilarity * 100).toFixed(2)}% | ` +
          `${(s.stdIntraSimilarity * 100).toFixed(2)}% | ` +
          `${s.meanMagnitude.toFixed(4)} | ${meanVar.toExponential(3)} |`
      )
    }
    lines.push('')

    // Bias indicators for this model
    const sims = GROUPS.map(g => r.groups[g]?.meanIntraSimilarity ?? 0)
    const minSim = Math.min(...sims)
    const maxSim = Math.max(...sims)
    let maxInter = -Infinity
    let minInter = Infinity
    let maxPair = ''
    let minPair = ''
    for (let i = 0; i < GROUPS.length; i++) {
      for (let j = i + 1; j < GROUPS.length; j++) {
        const s = r.interGroupSimilarity[i][j]
        if (s > maxInter) {
          maxInter = s
          maxPair = `${GROUP_DISPLAY(GROUPS[i])}↔${GROUP_DISPLAY(GROUPS[j])}`
        }
        if (s < minInter) {
          minInter = s
          minPair = `${GROUP_DISPLAY(GROUPS[i])}↔${GROUP_DISPLAY(GROUPS[j])}`
        }
      }
    }
    lines.push(
      `**Bias indicators:** Intra-range Δ=${((maxSim - minSim) * 100).toFixed(2)}% (${(minSim * 100).toFixed(2)}%–${(maxSim * 100).toFixed(2)}%). Highest cohesion: ${GROUP_DISPLAY(GROUPS[sims.indexOf(maxSim)])}. Lowest: ${GROUP_DISPLAY(GROUPS[sims.indexOf(minSim)])}. Closest groups: ${maxPair} (${(maxInter * 100).toFixed(1)}%). Farthest: ${minPair} (${(minInter * 100).toFixed(1)}%).`
    )
    lines.push('')
  }

  // A.7 NN accuracy by group (consolidated)
  lines.push('### A.7 NN Accuracy by Group')
  lines.push('')
  lines.push('| Group | ' + results.map(r => r.model).join(' | ') + ' |')
  lines.push('|-------|' + results.map(() => '-------').join('|') + '|')
  for (const g of GROUPS) {
    const row = results.map(r => {
      const nn = r.nnByGroup[g]
      if (!nn || nn.same + nn.other === 0) return '—'
      return (
        ((nn.same / Math.max(nn.same + nn.other, 1)) * 100).toFixed(1) + '%'
      )
    })
    lines.push(`| ${g} | ${row.join(' | ')} |`)
  }
  lines.push('')

  // A.8 PCA of group centroids
  lines.push('### A.8 PCA of Group Centroids')
  lines.push('')
  lines.push(
    'Figure 6 (`metrics/figures/figure06-pca-centroids.png`) shows the PCA projection of the 8 group centroids for each model.'
  )
  lines.push('')
  for (const r of results) {
    lines.push(`**${r.model}**`)
    lines.push('')
    const centroids: Record<string, Embedding> = {}
    for (const g of GROUPS) {
      if (r.groups[g]?.centroid.length) centroids[g] = r.groups[g].centroid
    }
    const pca = computePCA(centroids, r.dim)
    if (pca.pc1.length === 0) {
      lines.push('*PCA not available*')
      lines.push('')
      continue
    }
    lines.push(
      `| Group | PC1 | PC2 | Explained: PC1=${(pca.explained[0] * 100).toFixed(1)}%, PC2=${(pca.explained[1] * 100).toFixed(1)}% |`
    )
    lines.push('|-------|-----|-----|-----------|')
    for (const g of GROUPS) {
      if (!centroids[g]) continue
      const c = centroids[g]
      let p1 = 0,
        p2 = 0
      for (let d = 0; d < c.length; d++) {
        p1 += c[d] * pca.pc1[d]
        p2 += c[d] * pca.pc2[d]
      }
      lines.push(`| ${g} | ${p1.toExponential(4)} | ${p2.toExponential(4)} | |`)
    }
    lines.push('')
  }

  lines.push('---')
  lines.push(
    `_Appendix A generated by metrics/analyze-bias.ts — ${new Date().toISOString()}_`
  )
  lines.push('')

  return lines.join('\n')
}

// ---------- main entry ----------
async function main() {
  console.error('[analyze] Loading embeddings...')

  const results: ModelResult[] = []
  for (const model of MODELS) {
    const path = resolve(process.cwd(), 'metrics/embeddings', `${model}.json`)
    console.error(`[analyze] Loading ${model}...`)
    const raw = readFileSync(path, 'utf-8')
    const data: Record<string, Embedding> = JSON.parse(raw)
    console.error(
      `[analyze] ${model}: ${Object.keys(data).length} embeddings, ${data[Object.keys(data)[0]].length}d`
    )

    console.error(`[analyze] Analyzing ${model}...`)
    const result = analyzeModel(model, data)
    results.push(result)

    // Log quick summary
    const sims = GROUPS.map(g => result.groups[g]?.meanIntraSimilarity ?? 0)
    const minSim = (Math.min(...sims) * 100).toFixed(1)
    const maxSim = (Math.max(...sims) * 100).toFixed(1)
    console.error(
      `[analyze] ${model} done. Intra-sim range: ${minSim}% – ${maxSim}%. NN acc: ${(result.nnAccuracy * 100).toFixed(1)}%`
    )
  }

  console.error('[analyze] Generating Appendix A...')
  const appendix = generateAppendix(results)

  const docPath = resolve(process.cwd(), 'docs/benchmark-analysis.md')
  const doc = readFileSync(docPath, 'utf-8')
  const appendixStart = doc.indexOf('## Appendix A')
  const refsStart = doc.indexOf('## References', appendixStart)
  if (appendixStart === -1 || refsStart === -1) {
    console.error(
      'FATAL: Could not find "## Appendix A" or "## References" markers in docs/benchmark-analysis.md'
    )
    process.exit(1)
  }
  const newDoc =
    doc.slice(0, appendixStart) + appendix + '\n' + doc.slice(refsStart)
  writeFileSync(docPath, newDoc, 'utf-8')
  console.error(`[analyze] Appendix A updated in ${docPath}`)
}

main().catch(e => {
  console.error(`FATAL: ${e.message}`)
  process.exit(1)
})
