import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Dirent } from 'node:fs'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

const isNotFoundError = (error: unknown): boolean =>
  error instanceof Error &&
  'code' in error &&
  (error as { code?: unknown }).code === 'ENOENT'

const PHOTO_URL_TTL_MS = 30_000

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
  list(userFolder: string): Promise<string[]>
  getUrl(relativePath: string): string
  isUrlValid(path: string, signature: string, expiresAt: number): boolean
}

export class DiskPhotoStorage implements PhotoStorage {
  #photosDir: string
  #baseUrl: string
  #urlSecret: string

  constructor(config: {
    photosDir: string
    baseUrl: string
    urlSecret: string
  }) {
    this.#photosDir = config.photosDir
    this.#baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.#urlSecret = config.urlSecret
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

    await mkdir(dirname(fullPath), { recursive: true })
    await writeFile(fullPath, buffer)

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
      .filter(name => !/^\d/.test(name))
  }

  getUrl(relativePath: string): string {
    const expiresAt = Date.now() + PHOTO_URL_TTL_MS
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
}
