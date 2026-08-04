/**
 * Calculates cosine similarity between two embeddings
 *
 * Shared by the runtime verification path and the threshold-derivation
 * scripts so the production threshold cannot drift from the service math.
 *
 * @param embedding1 - First embedding
 * @param embedding2 - Second embedding
 * @returns Similarity score between -1 and 1
 */
export function cosineSimilarity(
  embedding1: ArrayLike<number>,
  embedding2: ArrayLike<number>
): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error(
      `Embedding size mismatch: ${embedding1.length} vs ${embedding2.length}`
    )
  }

  let dotProduct = 0
  let norm1 = 0
  let norm2 = 0

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i]
    norm1 += embedding1[i] * embedding1[i]
    norm2 += embedding2[i] * embedding2[i]
  }

  const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2)

  if (magnitude === 0) {
    return 0
  }

  return dotProduct / magnitude
}
