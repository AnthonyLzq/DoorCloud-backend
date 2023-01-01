import crypto from 'crypto'
import { MultipartFile } from '@fastify/multipart'
import { FastifyBaseLogger } from 'fastify'

import {
  createUser,
  getPhotosUrls,
  getUserByUserID,
  uploadUserPhoto
} from 'database'
import { CustomError } from 'network/http'
import { getTimestamp } from 'utils'
import { sendPhotoThroughWhatsapp } from 'integrations'

class UserServices {
  #log: FastifyBaseLogger

  constructor(log: FastifyBaseLogger) {
    this.#log = log
  }

  async createUser(name: string, phone: string) {
    const data = await createUser(name, phone, this.#log)

    this.#log.info(data, 'User created')

    return {
      id: data[0]?.userID,
      name,
      phone,
      folderID: `${name}-${data[0]?.userID}`
    }
  }

  async uploadPhotos(
    folderID: string,
    files: AsyncIterableIterator<MultipartFile>
  ): Promise<string[]> {
    const [userName, ...rest] = folderID.split('-')
    const userID = rest.join('-')

    await getUserByUserID(userID, this.#log)

    const paths: string[] = []

    for await (const file of files) {
      const format = file.mimetype.split('/')[1]
      const response = await uploadUserPhoto(
        `${userName}-${userID}/${
          file.fieldname
        }-${crypto.randomUUID()}.${format}`,
        await file.toBuffer(),
        this.#log
      )

      paths.push(response.data.path)
    }

    return await getPhotosUrls(paths, 900, this.#log)
  }

  async sendPhotoThroughWhatsapp(
    userID: string,
    format: string,
    bufferPhoto: Buffer
  ) {
    const [user] = await getUserByUserID(userID, this.#log)

    if (!user) {
      const errorMessage = 'User not found'
      this.#log.error(errorMessage)

      throw new CustomError(errorMessage, 404)
    }

    const { name, phone } = user
    const response = await uploadUserPhoto(
      `${name}-${userID}/${getTimestamp()}-${crypto.randomUUID()}.${format}`,
      bufferPhoto,
      this.#log
    )
    const [url] = await getPhotosUrls([response.data.path], 900, this.#log)

    await sendPhotoThroughWhatsapp(url, phone, this.#log)
  }
}
export { UserServices }
