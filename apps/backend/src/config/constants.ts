/**
 * Face verification constants
 *
 * DEFAULT_VERIFY_THRESHOLD is derived from the production pipeline
 * (SCRFD det_500m detection + landmark alignment + w600k_mbf embedding)
 * re-embedded on the full BFW pair dataset: threshold at FAR = 1e-4 is
 * 0.3435 (see docs/benchmark-analysis.md section 4.7). The older
 * center-crop benchmark baseline was 0.3719 — do not use it for
 * production configuration.
 */
export const DEFAULT_VERIFY_THRESHOLD = 0.3435

export const MAX_STORED_PHOTOS = 10
