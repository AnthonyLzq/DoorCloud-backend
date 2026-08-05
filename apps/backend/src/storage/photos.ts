import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Dirent } from 'node:fs'
import {
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile
} from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'

const isNotFoundError = (error: unknown): boolean =>
  error instanceof Error &&
  'code' in error &&
  (error as { code?: unknown }).code === 'ENOENT'

// Temp-upload suffix shared by upload() (writing) and list() (filtering), so
// the naming scheme and the exclusion filter cannot drift apart.
const TMP_UPLOAD_SUFFIX = '.tmp-'

// Orphaned temp files older than this are considered crash leftovers (not
// concurrent uploads) and are removed by the next upload to the same folder.
const TMP_ORPHAN_AGE_MS = 60_000

// RF-1/RF-8: the no-match sink folder is excluded from known persons; it is
// only reachable through the unidentified primitives (listUnidentified,
// deletePhoto, movePhoto, upload).
export const UNIDENTIFIED_FOLDER = 'unidentified'

const signPhotoPath = (
  secret: string,
  expiresAt: number,
  relativePath: string
) =>
  createHmac('sha256', secret)
    .update(`${expiresAt}:${relativePath}`)
    .digest('hex')

export interface PhotoStorage {
  upload(userFolder: string, filename: string, buffer: Buffer): Promise<string>

  /**
   * Lists a user's stored photos under `PHOTOS_DIR/{userFolder}`.
   *
   * Returns only verified photo filenames: files whose names start with a
   * numeric timestamp (no-match photos) are excluded, and a missing user
   * folder resolves to an empty list.
   *
   * @param userFolder - `{name}-{id}` folder to list
   * @returns Verified photo filenames (without the folder prefix)
   */
  list(userFolder: string): Promise<string[]>

  /**
   * Lists the known person folders directly under `PHOTOS_DIR`.
   *
   * Every child directory is one known person; the folder name IS the
   * person's identity (e.g. `Bryan Ramos`). A missing photos directory
   * resolves to an empty list.
   *
   * @returns Person folder names (no path prefix)
   */
  listDirectories(): Promise<string[]>
  getUrl(relativePath: string): string
  isUrlValid(path: string, signature: string, expiresAt: number): boolean

  /**
   * Resolves a URL path segment to an absolute path inside PHOTOS_DIR.
   *
   * Throws when the path escapes the photos directory. Centralizes the
   * containment check so route handlers do not re-implement traversal
   * validation.
   *
   * @param relativePath - Path relative to PHOTOS_DIR
   * @returns Absolute filesystem path
   */
  resolvePath(relativePath: string): string

  // RF-9: folder primitives for the photo admin (PA-4). All paths resolve
  // through the containment check; the reserved unidentified tray folder
  // cannot be created, renamed, or deleted through them.
  createFolder(name: string): Promise<void>
  renameFolder(from: string, to: string): Promise<void>
  deleteFolder(name: string): Promise<void>

  // RF-10: photo primitives for the admin API and the unidentified tray.
  // movePhoto SHALL move, never copy.
  deletePhoto(folder: string, filename: string): Promise<void>
  movePhoto(
    fromFolder: string,
    filename: string,
    toFolder: string
  ): Promise<string>

  // RF-8: raw tray listing; only .tmp- upload leftovers are hidden, so the
  // numeric-prefix sink files show up for promote/delete.
  listUnidentified(): Promise<string[]>
}

export class DiskPhotoStorage implements PhotoStorage {
  #photosDir: string
  #baseUrl: string
  #urlSecret: string
  #urlTtlMs: number

  constructor(config: {
    photosDir: string
    baseUrl: string
    urlSecret: string
    urlTtlMs: number
  }) {
    this.#photosDir = config.photosDir
    this.#baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.#urlSecret = config.urlSecret
    this.#urlTtlMs = config.urlTtlMs
  }

  #safeJoin(...parts: string[]): string {
    const fullPath = resolve(this.#photosDir, ...parts)
    const relativePath = relative(this.#photosDir, fullPath)

    if (
      relativePath.startsWith('..') ||
      relativePath === '..' ||
      relativePath === ''
    )
      throw new Error('Path escapes PHOTOS_DIR')

    return fullPath
  }

  #assertNotReserved(name: string): void {
    if (name === UNIDENTIFIED_FOLDER)
      throw new Error(`Folder name "${UNIDENTIFIED_FOLDER}" is reserved`)
  }

  async createFolder(name: string): Promise<void> {
    this.#assertNotReserved(name)
    await mkdir(this.#safeJoin(name), { recursive: true })
  }

  async renameFolder(from: string, to: string): Promise<void> {
    this.#assertNotReserved(to)
    await rename(this.#safeJoin(from), this.#safeJoin(to))
  }

  async deleteFolder(name: string): Promise<void> {
    this.#assertNotReserved(name)
    await rm(this.#safeJoin(name), { force: true, recursive: true })
  }

  async deletePhoto(folder: string, filename: string): Promise<void> {
    await unlink(this.#safeJoin(folder, filename))
  }

  async movePhoto(
    fromFolder: string,
    filename: string,
    toFolder: string
  ): Promise<string> {
    // The tray is a valid photo DESTINATION (migration, promote); the
    // reservation only protects folder-level primitives (create/rename/
    // delete) so no known person can be named "unidentified".
    const sourcePath = this.#safeJoin(fromFolder, filename)
    const targetPath = this.#safeJoin(toFolder, filename)

    await mkdir(dirname(targetPath), { recursive: true })
    await rename(sourcePath, targetPath)

    return `${toFolder}/${filename}`
  }

  async listUnidentified(): Promise<string[]> {
    let entries: Dirent[]

    try {
      entries = await readdir(this.#safeJoin(UNIDENTIFIED_FOLDER), {
        withFileTypes: true
      })
    } catch (error) {
      if (isNotFoundError(error)) return []
      throw error
    }

    return entries
      .filter(entry => entry.isFile())
      .map(entry => entry.name)
      .filter(name => !name.includes(TMP_UPLOAD_SUFFIX))
  }

  async upload(
    userFolder: string,
    filename: string,
    buffer: Buffer
  ): Promise<string> {
    const fullPath = this.#safeJoin(userFolder, filename)
    const tmpPath = `${fullPath}${TMP_UPLOAD_SUFFIX}${randomUUID()}`

    await mkdir(dirname(fullPath), { recursive: true })

    try {
      // Write to a temp sibling then rename so a crash or ENOSPC never leaves
      // a truncated file at the final path (which would otherwise be picked up
      // by list() and fed to face verification).
      await writeFile(tmpPath, buffer)
      await rename(tmpPath, fullPath)
    } catch (error) {
      await unlink(tmpPath).catch(() => undefined)
      throw error
    }

    await this.#removeOrphanedTmp(dirname(fullPath))

    return `${userFolder}/${filename}`
  }

  /**
   * Removes temp-upload leftovers older than TMP_ORPHAN_AGE_MS from a folder.
   *
   * A crash between writeFile and rename leaves a truncated `.tmp-*` file;
   * list() already hides it, and the next successful upload sweeps it away so
   * the disk does not accumulate orphaned partial writes forever.
   *
   * @param dirPath - Folder to sweep (already validated as inside PHOTOS_DIR)
   */
  async #removeOrphanedTmp(dirPath: string): Promise<void> {
    const cutoff = Date.now() - TMP_ORPHAN_AGE_MS
    let entries: Dirent[]

    try {
      entries = await readdir(dirPath, { withFileTypes: true })
    } catch {
      return
    }

    await Promise.all(
      entries
        .filter(
          entry => entry.isFile() && entry.name.includes(TMP_UPLOAD_SUFFIX)
        )
        .map(async entry => {
          const entryPath = join(dirPath, entry.name)
          try {
            const { mtimeMs } = await stat(entryPath)
            if (mtimeMs < cutoff) await unlink(entryPath)
          } catch {
            // A race removed the file already; nothing to do.
          }
        })
    )
  }

  async list(userFolder: string): Promise<string[]> {
    const dirPath = this.#safeJoin(userFolder)

    let entries: Dirent[]
    try {
      entries = await readdir(dirPath, { withFileTypes: true })
    } catch (error) {
      if (isNotFoundError(error)) return []
      throw error
    }

    return entries
      .filter(entry => entry.isFile())
      .map(entry => entry.name)
      .filter(name => !/^\d/.test(name) && !name.includes(TMP_UPLOAD_SUFFIX))
  }

  async listDirectories(): Promise<string[]> {
    let entries: Dirent[]

    try {
      entries = await readdir(this.#photosDir, { withFileTypes: true })
    } catch (error) {
      if (isNotFoundError(error)) return []
      throw error
    }

    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter(name => name !== UNIDENTIFIED_FOLDER)
  }

  getUrl(relativePath: string): string {
    const expiresAt = Date.now() + this.#urlTtlMs
    const signature = signPhotoPath(this.#urlSecret, expiresAt, relativePath)

    return `${this.#baseUrl}/${signature}/${expiresAt}/${relativePath}`
  }

  isUrlValid(path: string, signature: string, expiresAt: number): boolean {
    if (expiresAt <= Date.now()) return false

    const expected = Buffer.from(
      signPhotoPath(this.#urlSecret, expiresAt, path),
      'hex'
    )
    const provided = Buffer.from(signature, 'hex')

    return (
      expected.length === provided.length && timingSafeEqual(expected, provided)
    )
  }

  resolvePath(relativePath: string): string {
    return this.#safeJoin(relativePath)
  }
}
