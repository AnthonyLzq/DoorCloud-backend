import { readdir } from 'node:fs/promises'
import { type DiskPhotoStorage, UNIDENTIFIED_FOLDER } from './photos'

// RF-1 legacy: before the unidentified tray existed, no-match photos were
// sunk into the owner folder with a numeric-timestamp prefix
// ({timestamp}-{uuid}.{ext}). The prefix guarantees they are never listed
// as reference photos (list() filters /^\d/ by design), which is also why
// this migration walks the raw directory instead of using list().
const LEGACY_UNIDENTIFIED_RE = /^\d.*\.(jpg|jpeg|png|webp|gif)$/i

// Moves legacy timestamp-prefixed photos from every known-person folder to
// the unidentified tray. Idempotent: tray files never match the pattern a
// second time (they are no longer in a person folder). Returns the number
// of files moved.
const migrateLegacyUnidentified = async (
  photoStorage: DiskPhotoStorage
): Promise<number> => {
  let moved = 0

  for (const folder of await photoStorage.listDirectories()) {
    if (folder === UNIDENTIFIED_FOLDER) continue

    const entries = await readdir(photoStorage.resolvePath(folder), {
      withFileTypes: true
    })
    const files = entries
      .filter(entry => entry.isFile())
      .map(entry => entry.name)

    for (const file of files) {
      if (!LEGACY_UNIDENTIFIED_RE.test(file)) continue

      await photoStorage.movePhoto(folder, file, UNIDENTIFIED_FOLDER)
      moved += 1
    }
  }

  return moved
}

export { migrateLegacyUnidentified }
