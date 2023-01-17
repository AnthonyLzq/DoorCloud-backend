import crypto from 'crypto'
import { MultipartFile } from '@fastify/multipart'
import { FastifyBaseLogger } from 'fastify'
import { appendFileSync } from 'fs'

import {
  createUser,
  getAllFilesFromBucket,
  getPhotosUrls,
  getUserByUserID,
  updateUserLastMessage,
  uploadUserPhoto
} from 'database'
import { CustomError } from 'network/http'
import { compareFaces } from 'lib'
import {
  sayHelloThroughWhatsapp,
  sendPhotoDetectionResultThroughWhatsapp
} from 'integrations'
import { diffTimeInSeconds, getTimestamp, randomWait } from 'utils'
import { resolve } from 'path'

const MAX_HOUR_DIFFERENCE = 16

class UserServices {
  #log: FastifyBaseLogger

  constructor(log: FastifyBaseLogger) {
    this.#log = log
  }

  async createUser(name: string, phone: string) {
    const data = await createUser(name, phone, this.#log)

    this.#log.info(data, 'User created')

    return data[0]
  }

  async uploadPhotos(
    folderID: string,
    files: AsyncIterableIterator<MultipartFile>
  ): Promise<string[]> {
    const [userName, ...rest] = folderID.split('-')
    const userID = rest.join('-')

    await getUserByUserID(parseInt(userID), this.#log)

    const paths: string[] = []

    for await (const file of files) {
      const format = file.mimetype.split('/')[1]
      const response = await uploadUserPhoto({
        path: `${userName}-${userID}/${
          file.fieldname
        }-${crypto.randomUUID()}.${format}`,
        bufferFile: await file.toBuffer(),
        log: this.#log,
        format
      })

      paths.push(response.data.path)
    }

    return await getPhotosUrls(paths, 900, this.#log)
  }

  async sendPhotoThroughWhatsapp(
    userID: string,
    format: string,
    bufferPhoto: Buffer
  ) {
    const [user] = await getUserByUserID(parseInt(userID), this.#log)

    if (!user) {
      const errorMessage = 'User not found'
      this.#log.error(errorMessage)

      throw new CustomError(errorMessage, 404)
    }

    const { id, name, phone, lastMessage } = user

    if (!lastMessage)
      await Promise.all([
        sayHelloThroughWhatsapp(name, phone, this.#log),
        updateUserLastMessage(id, this.#log),
        randomWait(5_000, 7_500)
      ])
    else {
      const currentDate = new Date()
      const lastMessageDate = new Date(lastMessage)
      const hDiff = (currentDate.getTime() - lastMessageDate.getTime()) / 36e5

      if (hDiff > MAX_HOUR_DIFFERENCE)
        await Promise.all([
          sayHelloThroughWhatsapp(name, phone, this.#log),
          updateUserLastMessage(id, this.#log),
          randomWait(5_000, 7_500)
        ])
    }

    const photosFromUser = (
      await getAllFilesFromBucket(`${name}-${id}`, this.#log)
    ).map(file => `${name}-${id}/${file.name}`)
    const urlPhotosFromUser = await getPhotosUrls(
      photosFromUser,
      900,
      this.#log
    )
    const timeBefore = getTimestamp()
    const foundMatch = (
      await Promise.all(
        urlPhotosFromUser.map((url, index) => {
          return compareFaces(
            bufferPhoto,
            url,
            photosFromUser[index].split('/')[1].split('-')[0],
            this.#log
          )
        })
      )
    ).find(result => result.match)
    const timeAfter = getTimestamp()
    // const foundName = foundMatch?.name
    const matchResult = foundMatch?.match ?? false

    appendFileSync(
      resolve(__dirname, '..', '..', 'metrics', 'matchPhoto.csv'),
      `\n${matchResult ? 1 : 0},${diffTimeInSeconds(timeBefore, timeAfter)}`,
      'utf-8'
    )

    // const uploadResponse = await uploadUserPhoto({
    //   path: `${name}-${userID}/${
    //     foundName ?? getTimestamp()
    //   }-${crypto.randomUUID()}.${format}`,
    //   bufferFile: bufferPhoto,
    //   log: this.#log,
    //   format
    // })
    // const [url] = await getPhotosUrls(
    //   [uploadResponse.data.path],
    //   900,
    //   this.#log
    // )

    // await sendPhotoDetectionResultThroughWhatsapp({
    //   imageUrl: url,
    //   success: matchResult,
    //   name: foundName,
    //   phoneNumber: phone,
    //   log: this.#log
    // })
  }
}
export { UserServices }
