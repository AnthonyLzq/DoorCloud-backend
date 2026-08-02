import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

export interface PhotoStorage {
  upload(userFolder: string, filename: string, buffer: Buffer): Promise<string>
  list(userFolder: string): Promise<string[]>
  getUrl(relativePath: string): string
}

export class DiskPhotoStorage implements PhotoStorage {
  #photosDir: string
  #baseUrl: string

  constructor(config: { photosDir: string; baseUrl: string }) {
    this.#photosDir = config.photosDir
    this.#baseUrl = config.baseUrl.replace(/\/+$/, '')
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
    const entries = await readdir(dirPath, { withFileTypes: true })

    return entries
      .filter(entry => entry.isFile())
      .map(entry => entry.name)
      .filter(name => !/^\d/.test(name))
  }

  getUrl(relativePath: string): string {
    return `${this.#baseUrl}/${relativePath}`
  }
}
