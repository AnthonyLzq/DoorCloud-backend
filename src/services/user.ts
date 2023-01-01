import crypto from 'crypto'
import { MultipartFile } from '@fastify/multipart'
import { FastifyBaseLogger } from 'fastify'

import {
  createUser,
  getPhotosUrls,
  getUserByUserID,
  uploadUserPhoto
} from 'database'

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

    return await getPhotosUrls(paths, 200, this.#log)
  }
}
export { UserServices }
