import crypto from 'node:crypto'
import { appendFileSync } from 'node:fs'
import type { MultipartFile } from '@fastify/multipart'
import { getEnv } from 'config/env'
import { resolveMetricsPath } from 'config/paths'
import { getActiveUser } from 'config/user'
import type { FastifyBaseLogger } from 'fastify'
import {
  sayHelloThroughWhatsapp,
  sendPhotoDetectionResultThroughWhatsapp
} from 'integrations'
import { faceRecognitionService } from 'services/face-recognition'
import { DiskPhotoStorage } from 'storage/photos'
import { getUserState, type UserState } from 'storage/state'
import { diffTimeInSeconds, getTimestamp, randomWait } from 'utils'

const MAX_HOUR_DIFFERENCE = 16

class UserServices {
  #log: FastifyBaseLogger
  #photoStorage: DiskPhotoStorage
  #userState: UserState

  constructor(log: FastifyBaseLogger) {
    const {
      PHOTOS_DIR,
      PHOTOS_BASE_URL,
      PHOTOS_URL_SECRET,
      PHOTO_URL_TTL_MS,
      STATE_DB_PATH
    } = getEnv()

    this.#log = log
    this.#photoStorage = new DiskPhotoStorage({
      photosDir: PHOTOS_DIR,
      baseUrl: PHOTOS_BASE_URL,
      urlSecret: PHOTOS_URL_SECRET,
      urlTtlMs: PHOTO_URL_TTL_MS
    })
    this.#userState = getUserState(STATE_DB_PATH)
  }

  async uploadPhotos(
    files: AsyncIterableIterator<MultipartFile>
  ): Promise<string[]> {
    const { name } = getActiveUser()
    const paths: string[] = []

    for await (const file of files) {
      const format = file.mimetype.split('/')[1]
      // Keep the client-provided file name (identity lives in the parent
      // folder, not in the file name), sanitized and deduplicated with a uuid
      const originalName = (file.filename || file.fieldname).trim()
      const baseName =
        originalName.replace(/\.[^./]+$/, '').replace(/[^\w.-]+/g, '-') ||
        'photo'
      const path = await this.#photoStorage.upload(
        name,
        `${baseName}-${crypto.randomUUID()}.${format}`,
        await file.toBuffer()
      )

      paths.push(path)
    }

    return paths.map(path => this.#photoStorage.getUrl(path))
  }

  async sendPhotoThroughWhatsapp(format: string, bufferPhoto: Buffer) {
    const { name, phone } = getActiveUser()
    const lastMessage = this.#userState.getLastMessage()

    if (!lastMessage)
      await Promise.all([
        sayHelloThroughWhatsapp(name, phone, this.#log),
        this.#userState.setLastMessage(new Date()),
        randomWait(5_000, 7_500)
      ])
    else {
      const hDiff = (Date.now() - lastMessage.getTime()) / 36e5

      if (hDiff > MAX_HOUR_DIFFERENCE)
        await Promise.all([
          sayHelloThroughWhatsapp(name, phone, this.#log),
          this.#userState.setLastMessage(new Date()),
          randomWait(5_000, 7_500)
        ])
    }

    const personFolders = await this.#photoStorage.listDirectories()
    const referencePhotos = (
      await Promise.all(
        personFolders.map(async folder => {
          const files = await this.#photoStorage.list(folder)

          return files.map(file => ({
            // The person identity always comes from the parent folder name,
            // never from the file name (photos inside may be named anything)
            name: folder,
            url: this.#photoStorage.getUrl(`${folder}/${file}`)
          }))
        })
      )
    ).flat()
    const timeBefore = getTimestamp()
    const { FACE_VERIFY_THRESHOLD, FACE_VERIFY_MAX_PHOTOS } = getEnv()
    const verifyResult = await faceRecognitionService.verify(
      bufferPhoto,
      referencePhotos,
      {
        threshold: FACE_VERIFY_THRESHOLD,
        maxPhotos: FACE_VERIFY_MAX_PHOTOS
      }
    )
    const timeAfter = getTimestamp()
    const foundName = verifyResult.name
    const matchResult = verifyResult.match

    if (verifyResult.reason === 'no-face')
      this.#log.warn(
        { reason: verifyResult.reason },
        'No face detected in photo'
      )
    else this.#log.info({ reason: verifyResult.reason }, 'Photo verification')

    appendFileSync(
      resolveMetricsPath('matchPhoto.csv'),
      `\n${matchResult ? 1 : 0},${diffTimeInSeconds(timeBefore, timeAfter)}`,
      'utf-8'
    )

    // Matched door photos accumulate in the person's folder (they reinforce
    // the reference set); unmatched ones go to the owner folder with a
    // timestamp prefix so they are never re-listed as reference photos
    const uploadFolder = foundName ?? name
    const uploadName = foundName
      ? `${foundName}-${crypto.randomUUID()}.${format}`
      : `${getTimestamp()}-${crypto.randomUUID()}.${format}`

    const uploadPath = await this.#photoStorage.upload(
      uploadFolder,
      uploadName,
      bufferPhoto
    )

    await sendPhotoDetectionResultThroughWhatsapp({
      imageUrl: this.#photoStorage.getUrl(uploadPath),
      success: matchResult,
      name: foundName,
      similarity: verifyResult.similarity,
      threshold: FACE_VERIFY_THRESHOLD,
      phoneNumber: phone,
      log: this.#log
    })
  }
}

export { UserServices }
