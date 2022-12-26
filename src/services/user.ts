/* eslint-disable no-useless-return */
import { BusboyConfig } from '@fastify/busboy'
import { MultipartFile } from '@fastify/multipart'
import { FastifyRequest, FastifyReply } from 'fastify'
import { UserRequest } from '../schemas'
import { supabaseClient } from '../database'
import { PostgrestResponse } from '@supabase/postgrest-js/src/types'
import crypto from 'crypto'

declare module 'fastify' {
  interface FastifyRequest {
    files: (
      options?: Omit<BusboyConfig, 'headers'>
    ) => AsyncIterableIterator<MultipartFile>
  }
}

interface FastifyRequestExtended extends FastifyRequest {
  params: {
    idFolder: string
  }
}

class UserServices {
  static createUserSupabase = async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const { name, phone } = request.body as UserRequest
    const { data, error } = await supabaseClient
      .from('users')
      .insert({ name, phone })
      .select('userID')
    if (error) {
      reply.code(500).send({ error })
      // eslint-disable-next-line newline-before-return
      return
    }
    reply.send({ name, phone, idFolder: data[0].userID }).code(200)
  }

  static uploadPhotosSupabase = async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const { idFolder } = request.params as FastifyRequestExtended['params']
    const files = await request.files()
    if (!idFolder) {
      reply.code(400).send({ error: 'idFolder is required' })
      // eslint-disable-next-line newline-before-return
      return
    }
    const [user, ...arrUserID] = idFolder.split('-')
    const userID: string = arrUserID.join('-')
    const response: PostgrestResponse<UserSupabase | null> =
      await supabaseClient
        .from('users')
        .select('name')
        .eq('userID', userID)
        .select()
    if (!response.data) {
      reply.code(404).send({ error: ' User not found' })
      // eslint-disable-next-line newline-before-return
      return
    }
    if (response.data[0]?.name !== user) {
      reply.code(409).send({ error: 'wrong user' })
      // eslint-disable-next-line newline-before-return
      return
    }
    // any generic error
    if (response.error) {
      const { error } = response
      reply.code(500).send({ error })
      // eslint-disable-next-line newline-before-return
      return
    }
    for await (const file of files) {
      const bufferFile = await file.toBuffer()
      const format = file.mimetype.split('/')[1]
      await supabaseClient.storage
        .from('photos')
        .upload(
          `${idFolder}/${file.fieldname}-${crypto.randomUUID()}.${format}`,
          bufferFile
        )
        .then(res => {
          if (res.error) {
            reply.code(500).send({ error: res.error })
            // eslint-disable-next-line newline-before-return
            return
          }
        })
    }
    reply.code(200).send({ message: 'success' })
  }
}
export { UserServices }
