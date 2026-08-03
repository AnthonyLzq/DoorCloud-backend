import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Dirent } from 'node:fs'
import { mkdir, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

const isNotFoundError = (error: unknown): boolean =>
  error instanceof Error &&
  'code' in error &&
  (error as { code?: unknown }).code === 'ENOENT'

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

  async upload(
    userFolder: string,
    filename: string,
    buffer: Buffer
  ): Promise<string> {
    const fullPath = this.#safeJoin(userFolder, filename)
    const tmpPath = `${fullPath}.tmp-${randomUUID()}`

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

    return `${userFolder}/${filename}`
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
      .filter(name => !/^\d/.test(name) && !name.includes('.tmp-'))
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
