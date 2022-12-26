import { BusboyConfig } from '@fastify/busboy'
import { MultipartFile } from '@fastify/multipart'
import { FastifyRequest, FastifyReply, FastifyBaseLogger } from 'fastify'
import { PostgrestResponse } from '@supabase/postgrest-js/src/types'
import crypto from 'crypto'

import { supabaseClient } from 'database'

declare module 'fastify' {
  interface FastifyRequest {
    files: (
      options?: Omit<BusboyConfig, 'headers'>
    ) => AsyncIterableIterator<MultipartFile>
  }
}

class UserServices {
  #log: FastifyBaseLogger

  constructor(log: FastifyBaseLogger) {
    this.#log = log
  }

  async createUser(name: string, phone: string) {
    // getUserByNameAndPhone
    const { data, error } = await supabaseClient
      .from('users')
      .insert({ name, phone })
      .select('userID')

    if (error) {
      const message = 'Error while creating user'
      this.#log.error(error, message)

      throw new Error(message)
    }

    return {
      name,
      phone,
      idFolder: data[0].userID
    }
  }

  static uploadPhotosSupabase = async (
    request: FastifyRequest<{ Params: { idFolder: string } }>,
    reply: FastifyReply
  ) => {
    const {
      params: { idFolder }
    } = request

    if (!idFolder)
      return reply.code(400).send({ error: 'idFolder is required' })

    const files = await request.files()
    const [user, ...arrUserID] = idFolder.split('-')
    const userID: string = arrUserID.join('-')
    const response: PostgrestResponse<UserSupabase | null> =
      await supabaseClient
        .from('users')
        .select('name')
        .eq('userID', userID)
        .select()

    if (!response.data)
      return reply.code(404).send({ error: ' User not found' })

    if (response.data[0]?.name !== user)
      return reply.code(409).send({ error: 'wrong user' })

    // any generic error
    if (response.error) {
      const { error } = response

      return reply.code(500).send({ error })
    }

    for await (const file of files) {
      const bufferFile = await file.toBuffer()
      const format = file.mimetype.split('/')[1]
      const response = await supabaseClient.storage
        .from('photos')
        .upload(
          `${idFolder}/${file.fieldname}-${crypto.randomUUID()}.${format}`,
          bufferFile
        )

      if (response.error) return reply.code(500).send({ error: response.error })
    }

    return reply.code(200).send({ message: 'success' })
  }

  async uploadPhotos(
    idFolder: string,
    files: AsyncIterableIterator<MultipartFile>
  ) {
    const [user, ...arrUserID] = idFolder.split('-')
    const userID: string = arrUserID.join('-')
    const response: PostgrestResponse<UserSupabase | null> =
      await supabaseClient
        .from('users')
        .select('name')
        .eq('userID', userID)
        .select()
    let errorMessage = ''

    if (!response.data) {
      errorMessage = 'User not found'
      this.#log.error(errorMessage)

      throw new Error(errorMessage)
    }

    if (response.data[0]?.name !== user) {
      errorMessage = 'Wrong user'
      this.#log.error(errorMessage)

      throw new Error(errorMessage)
    }

    // any generic error
    if (response.error) {
      const { error } = response

      errorMessage = 'Unknown error'
      this.#log.error(error, errorMessage)

      throw new Error(errorMessage)
    }

    for await (const file of files) {
      const bufferFile = await file.toBuffer()
      const format = file.mimetype.split('/')[1]
      const response = await supabaseClient.storage
        .from('photos')
        .upload(
          `${idFolder}/${file.fieldname}-${crypto.randomUUID()}.${format}`,
          bufferFile
        )

      if (response.error) {
        errorMessage = 'Error while uploading file'
        this.#log.error(response.error, errorMessage)

        throw new Error(errorMessage)
      }
    }

    return 'success'
  }
}
export { UserServices }
