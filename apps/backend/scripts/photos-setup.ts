import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif)$/i

// Matches the list() exclusion rules in src/storage/photos.ts so a photo
// registered through the CLI is actually visible to face verification.
const isExcludedName = (name: string): boolean =>
  /^\d/.test(name) || name.includes('.tmp-')

type SetupSummary = {
  files: string[]
  folder: string
}

/**
 * Copies image files from a source folder into the active user's photo folder
 *
 * Lets a user register reference photos from the CLI instead of uploading
 * them over HTTP (`POST /api/user/upload` still works as an alternative).
 * Non-image files are skipped, and names that `list()` would exclude
 * (numeric-prefix no-match photos and `.tmp-` leftovers) are skipped with a
 * warning so they never silently become reference photos.
 *
 * @param source - Folder containing the reference photos
 * @param targetRoot - Destination folder (usually `PHOTOS_DIR/{USER_NAME}`)
 * @param options - Optional dry-run flag to only report what would be copied
 * @returns Copied filenames and the destination folder
 */
export const setupPhotos = async (
  source: string,
  targetRoot: string,
  options: { dryRun?: boolean } = {}
): Promise<SetupSummary> => {
  const sourceRoot = resolve(source)

  if (!existsSync(sourceRoot)) {
    throw new Error(`Source ${source} does not exist`)
  }

  if (!options.dryRun) mkdirSync(targetRoot, { recursive: true })

  const files: string[] = []

  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !IMAGE_EXTENSIONS.test(entry.name)) continue

    if (isExcludedName(entry.name)) {
      console.warn(
        `[photos:setup] Skipping ${entry.name}: the name would be excluded by list() and never reach verification`
      )

      continue
    }

    if (!options.dryRun) {
      copyFileSync(join(sourceRoot, entry.name), join(targetRoot, entry.name))
    }

    files.push(entry.name)
  }

  return { files, folder: targetRoot }
}
