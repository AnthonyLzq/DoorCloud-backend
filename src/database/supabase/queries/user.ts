import { PostgrestResponse } from '@supabase/postgrest-js'
import { FastifyBaseLogger } from 'fastify'
import { CustomError } from 'network/http'

import { supabaseConnection } from '../connection'

const createUser = async (
  name: string,
  phone: string,
  log: FastifyBaseLogger
): Promise<(UserSupabase | null)[]> => {
  const { data, error }: PostgrestResponse<UserSupabase | null> =
    await supabaseConnection().from('users').insert({ name, phone }).select('*')

  const errorMessage = 'Error while creating user'

  if (error) {
    log.error(error, errorMessage)

    throw new CustomError(errorMessage)
  }

  if (!data[0]) {
    log.error(error, errorMessage)

    throw new CustomError(errorMessage)
  }

  return data
}

const getUserByUserID = async (
  userID: string,
  log: FastifyBaseLogger
): Promise<(UserSupabase | null)[]> => {
  const { data, error }: PostgrestResponse<UserSupabase | null> =
    await supabaseConnection()
      .from('users')
      .select('name')
      .eq('userID', userID)
      .select('*')
  let errorMessage = ''

  if (!data) {
    errorMessage = 'User not found'
    log.error(errorMessage)

    throw new CustomError(errorMessage, 404)
  }

  if (data[0]?.userID !== userID) {
    errorMessage = 'Wrong user'
    log.error(errorMessage)

    throw new CustomError(errorMessage, 409)
  }

  // any generic error
  if (error) {
    errorMessage = 'Unknown error'
    log.error(error, errorMessage)

    throw new CustomError(errorMessage)
  }

  return data
}

const uploadUserPhoto = async (
  path: string,
  bufferFile: Buffer,
  log: FastifyBaseLogger
) => {
  const response = await supabaseConnection()
    .storage.from('photos')
    .upload(path, bufferFile)

  if (response.error) {
    const errorMessage = 'Error while uploading file'
    log.error(response.error, errorMessage)

    throw new CustomError(errorMessage)
  }

  return response
}

const getPhotosUrls = async (
  paths: string[],
  time: number,
  log: FastifyBaseLogger
) => {
  const { data, error } = await supabaseConnection()
    .storage.from('photos')
    .createSignedUrls(paths, time)

  if (error)
    log.error(
      error,
      'Error while trying to get the urls for the uploaded images'
    )

  return (
    data?.reduce<string[]>((acc, url, index) => {
      if (url.error) {
        log.error(
          url.error,
          `Error while trying to get a url for the uploaded image number: ${
            index + 1
          }`
        )

        return acc
      }

      acc.push(url.signedUrl)

      return acc
    }, []) ?? []
  )
}

export { createUser, getUserByUserID, uploadUserPhoto, getPhotosUrls }
