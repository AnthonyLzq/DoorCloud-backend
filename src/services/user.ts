import crypto from 'crypto'
import { MultipartFile } from '@fastify/multipart'
import { FastifyBaseLogger } from 'fastify'

import {
  createUser,
  getPhotosUrls,
  getUserByUserID,
  updateUserLastMessage,
  uploadUserPhoto
} from 'database'
import { CustomError } from 'network/http'
import { getTimestamp } from 'utils'
import { sayHelloThroughWhatsapp, sendPhotoThroughWhatsapp } from 'integrations'

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
        updateUserLastMessage(id, this.#log)
      ])
    else {
      const currentDate = new Date()
      const lastMessageDate = new Date(lastMessage)
      const hDiff = (currentDate.getTime() - lastMessageDate.getTime()) / 36e5

      if (hDiff > MAX_HOUR_DIFFERENCE)
        await Promise.all([
          sayHelloThroughWhatsapp(name, phone, this.#log),
          updateUserLastMessage(id, this.#log)
        ])
    }

    const response = await uploadUserPhoto({
      path: `${name}-${userID}/${getTimestamp()}-${crypto.randomUUID()}.${format}`,
      bufferFile: bufferPhoto,
      log: this.#log,
      format
    })
    const [url] = await getPhotosUrls([response.data.path], 900, this.#log)

    await sendPhotoThroughWhatsapp(url, phone, this.#log)
  }
}
export { UserServices }
