import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Constant-time comparison: hashes both sides before comparing so the value
 * lengths are never leaked through the response timing.
 */
export const safeEqual = (expected: string, actual: string): boolean => {
  const expectedHash = createHash('sha256').update(expected).digest()
  const actualHash = createHash('sha256').update(actual).digest()

  return timingSafeEqual(expectedHash, actualHash)
}
