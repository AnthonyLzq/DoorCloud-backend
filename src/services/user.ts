import crypto from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { MultipartFile } from '@fastify/multipart'
import { getEnv } from 'config/env'
import { getActiveUser } from 'config/user'
import type { FastifyBaseLogger } from 'fastify'
import {
  sayHelloThroughWhatsapp,
  sendPhotoDetectionResultThroughWhatsapp
} from 'integrations'
import { CustomError } from 'network/http'
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
    folderID: string,
    files: AsyncIterableIterator<MultipartFile>
  ): Promise<string[]> {
    const [userName, ...rest] = folderID.split('-')
    const userID = rest.join('-')
    const parsedUserID = parseInt(userID, 10)

    if (Number.isNaN(parsedUserID)) {
      const errorMessage = 'Invalid userID: must be a number'
      this.#log.error(errorMessage)

      throw new CustomError(errorMessage, 400)
    }

    const paths: string[] = []

    for await (const file of files) {
      const format = file.mimetype.split('/')[1]
      const path = await this.#photoStorage.upload(
        `${userName}-${userID}`,
        `${file.fieldname}-${crypto.randomUUID()}.${format}`,
        await file.toBuffer()
      )

      paths.push(path)
    }

    return paths.map(path => this.#photoStorage.getUrl(path))
  }

  async sendPhotoThroughWhatsapp(format: string, bufferPhoto: Buffer) {
    const { id, name, phone } = getActiveUser()
    const lastMessage = this.#userState.getLastMessage(id)

    if (!lastMessage)
      await Promise.all([
        sayHelloThroughWhatsapp(name, phone, this.#log),
        this.#userState.setLastMessage(id, new Date()),
        randomWait(5_000, 7_500)
      ])
    else {
      const hDiff = (Date.now() - lastMessage.getTime()) / 36e5

      if (hDiff > MAX_HOUR_DIFFERENCE)
        await Promise.all([
          sayHelloThroughWhatsapp(name, phone, this.#log),
          this.#userState.setLastMessage(id, new Date()),
          randomWait(5_000, 7_500)
        ])
    }

    const userFolder = `${name}-${id}`
    const photosFromUser = (await this.#photoStorage.list(userFolder)).map(
      file => `${userFolder}/${file}`
    )
    const urlPhotosFromUser = photosFromUser.map(path =>
      this.#photoStorage.getUrl(path)
    )
    const timeBefore = getTimestamp()
    const { FACE_VERIFY_THRESHOLD, FACE_VERIFY_MAX_PHOTOS } = getEnv()
    const verifyResult = await faceRecognitionService.verify(
      bufferPhoto,
      urlPhotosFromUser.map((url, index) => ({
        name: photosFromUser[index].split('/')[1].split('-')[0],
        url
      })),
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
      resolve(__dirname, '..', '..', 'metrics', 'matchPhoto.csv'),
      `\n${matchResult ? 1 : 0},${diffTimeInSeconds(timeBefore, timeAfter)}`,
      'utf-8'
    )

    const uploadPath = await this.#photoStorage.upload(
      userFolder,
      `${foundName ?? getTimestamp()}-${crypto.randomUUID()}.${format}`,
      bufferPhoto
    )

    await sendPhotoDetectionResultThroughWhatsapp({
      imageUrl: this.#photoStorage.getUrl(uploadPath),
      success: matchResult,
      name: foundName,
      phoneNumber: phone,
      log: this.#log
    })
  }
}

export { UserServices }
