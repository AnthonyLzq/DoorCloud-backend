import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface DatasetPair {
  image1: string
  image2: string
  label: 1 | 0
}

export interface Dataset {
  name: string
  pairs: DatasetPair[]
  rootDir: string
}

const DATASET_DIR = resolve(process.cwd(), 'datasets')

const DATASET_CONFIGS: Record<string, { dir: string; pairFile: string }> = {
  'agedb-30': { dir: 'agedb-30', pairFile: 'agedb_30_pair.txt' },
  calfw: { dir: 'calfw', pairFile: 'calfw_pair.txt' },
  'casia-webface': { dir: 'casia-webface', pairFile: '' },
  'cfp-fp': { dir: 'cfp-fp', pairFile: 'cfp_ff_pair.txt' },
  lfw: { dir: 'lfw', pairFile: 'pairs.txt' }
}

/**
 * Loads a dataset by name
 *
 * Parses the dataset pair file and validates that images exist.
 *
 * @param name - Dataset name (lfw, cfp-fp, agedb-30, calfw)
 * @param validateImages - Whether to validate image existence (default: false for performance)
 * @returns Dataset with name, pairs, and root directory
 */
export function loadDataset(name: string, validateImages = false): Dataset {
  const config = DATASET_CONFIGS[name]

  if (!config) {
    throw new Error(
      `Unknown dataset: ${name}. Available: ${Object.keys(DATASET_CONFIGS)
        .filter(k => k)
        .join(', ')}`
    )
  }

  const datasetDir = resolve(DATASET_DIR, config.dir)

  if (!existsSync(datasetDir)) {
    throw new Error(`Dataset directory not found: ${datasetDir}`)
  }

  let pairs: DatasetPair[]

  if (name === 'lfw') {
    pairs = parseLfwPairs(resolve(datasetDir, config.pairFile))
  } else if (['cfp-fp', 'agedb-30', 'calfw'].includes(name)) {
    pairs = parseSimplePairs(resolve(datasetDir, config.pairFile))
  } else if (name === 'casia-webface') {
    throw new Error(
      `Dataset "${name}" is a training dataset without verification pairs. ` +
        'Use loadDataset() for validation datasets only (lfw, cfp-fp, agedb-30, calfw).'
    )
  } else {
    throw new Error(`Dataset loader not implemented for: ${name}`)
  }

  if (validateImages) {
    validateImagePaths(name, datasetDir, pairs)
  }

  return { name, pairs, rootDir: datasetDir }
}

/**
 * Parses LFW pairs.txt format
 *
 * Format:
 *   Line 1: <subjectsPerEval>\t<pairsPerSubject> (metadata)
 *   Lines 2+: <subject> <img1> <img2>  (same pair)
 *              <subject1> <img1> <subject2> <img2>  (different pair)
 *
 * Pairs are resolved to absolute image paths.
 */
function parseLfwPairs(pairFile: string): DatasetPair[] {
  const content = readFileSync(pairFile, 'utf-8')
  const lines = content.trim().split('\n')

  if (lines.length < 2) {
    throw new Error(`LFW pairs file is empty or invalid: ${pairFile}`)
  }

  const pairs: DatasetPair[] = []
  // First line: metadata
  // Skip it, pairs start from line 2

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()

    if (!line) continue

    const parts = line.split('\t')

    if (parts.length === 3) {
      // Same pair: SubjectName img1 img2
      const [subject, img1, img2] = parts
      pairs.push({
        image1: `${subject}/${subject}_${img1.padStart(4, '0')}.jpg`,
        image2: `${subject}/${subject}_${img2.padStart(4, '0')}.jpg`,
        label: 1
      })
    } else if (parts.length === 4) {
      // Different pair: Subject1 img1 Subject2 img2
      const [subject1, img1, subject2, img2] = parts
      pairs.push({
        image1: `${subject1}/${subject1}_${img1.padStart(4, '0')}.jpg`,
        image2: `${subject2}/${subject2}_${img2.padStart(4, '0')}.jpg`,
        label: 0
      })
    } else {
      throw new Error(`Invalid LFW pair line: ${line}`)
    }
  }

  return pairs
}

/**
 * Parses simple pair format (CFP-FP, AgeDB-30, CALFW)
 *
 * Format: <img1.jpg> <img2.jpg> <label>
 * Where label is 1 (same person) or 0 (different)
 */
function parseSimplePairs(pairFile: string): DatasetPair[] {
  const content = readFileSync(pairFile, 'utf-8')
  const lines = content.trim().split('\n')

  if (lines.length === 0) {
    throw new Error(`Pair file is empty: ${pairFile}`)
  }

  const pairs: DatasetPair[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed) continue

    const parts = trimmed.split(/\s+/)

    if (parts.length !== 3) {
      throw new Error(
        `Invalid pair line: "${line}" — expected 3 fields, got ${parts.length}`
      )
    }

    const [img1, img2, labelStr] = parts
    const parsedLabel = parseInt(labelStr, 10)

    // Accept -1, 0 as "different" (0), 1 as "same"
    let label: 1 | 0
    if (parsedLabel === 1) {
      label = 1
    } else if (parsedLabel === 0 || parsedLabel === -1) {
      label = 0
    } else {
      throw new Error(
        `Invalid label in pair: "${line}" — expected -1, 0, or 1, got ${parsedLabel}`
      )
    }

    pairs.push({
      image1: img1,
      image2: img2,
      label
    })
  }

  return pairs
}

/**
 * Validates that all image paths in the pairs exist
 */
function validateImagePaths(
  datasetName: string,
  datasetDir: string,
  pairs: DatasetPair[]
): void {
  const missingImages: string[] = []

  for (const pair of pairs) {
    const path1 = resolve(datasetDir, pair.image1)
    const path2 = resolve(datasetDir, pair.image2)

    if (!existsSync(path1)) {
      missingImages.push(pair.image1)
    }

    if (!existsSync(path2)) {
      missingImages.push(pair.image2)
    }
  }

  if (missingImages.length > 0) {
    const sample = missingImages.slice(0, 10)
    throw new Error(
      `Dataset "${datasetName}" is missing ${missingImages.length} images. ` +
        `First missing: ${sample.join(', ')}`
    )
  }
}
