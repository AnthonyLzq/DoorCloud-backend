import { MultipartFile } from '@fastify/multipart'
import { FastifyBaseLogger } from 'fastify'
import { PostgrestResponse } from '@supabase/postgrest-js/src/types'
import crypto from 'crypto'

import { supabaseClient } from 'database'
import { CustomError } from 'network/http'

class UserServices {
  #log: FastifyBaseLogger

  constructor(log: FastifyBaseLogger) {
    this.#log = log
  }

  async createUser(name: string, phone: string) {
    // getUserByNameAndPhone
    const { data, error }: PostgrestResponse<UserSupabase | null> =
      await supabaseClient.from('users').insert({ name, phone }).select('*')

    if (error) {
      const message = 'Error while creating user'
      this.#log.error(error, message)

      throw new CustomError(message)
    }

    this.#log.info(data, 'User created')

    return {
      name,
      phone,
      folderID: `${name}-${data[0]?.userID}`
    }
  }

  async uploadPhotos(
    folderID: string,
    files: AsyncIterableIterator<MultipartFile>
  ) {
    const [userName, ...rest] = folderID.split('-')
    const userID = rest.join('-')
    const { data, error }: PostgrestResponse<UserSupabase | null> =
      await supabaseClient
        .from('users')
        .select('name')
        .eq('userID', userID)
        .select('*')
    let errorMessage = ''

    if (!data) {
      errorMessage = 'User not found'
      this.#log.error(errorMessage)

      throw new CustomError(errorMessage, 404)
    }

    if (data[0]?.userID !== userID) {
      errorMessage = 'Wrong user'
      this.#log.error(errorMessage)

      throw new CustomError(errorMessage, 409)
    }

    // any generic error
    if (error) {
      errorMessage = 'Unknown error'
      this.#log.error(error, errorMessage)

      throw new CustomError(errorMessage)
    }

    for await (const file of files) {
      const bufferFile = await file.toBuffer()
      const format = file.mimetype.split('/')[1]
      const response = await supabaseClient.storage
        .from('photos')
        .upload(
          `${userName}-${userID}/${
            file.fieldname
          }-${crypto.randomUUID()}.${format}`,
          bufferFile
        )

      if (response.error) {
        errorMessage = 'Error while uploading file'
        this.#log.error(response.error, errorMessage)

        throw new CustomError(errorMessage)
      }
    }

    return 'success'
  }
}
export { UserServices }
