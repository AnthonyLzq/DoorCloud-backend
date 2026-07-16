import { z } from 'zod'

const imageFormatSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9.+-]+$/i, 'format must be an image subtype')

const photoSendPayloadSchema = z.object({
  userId: z.union([z.string().trim().min(1), z.number().int().positive()]),
  format: imageFormatSchema,
  photo: z.string().trim().min(1)
})

const photoMetricsPayloadSchema = z.object({
  timestampSent: z.union([
    z.number().int().positive(),
    z.string().trim().min(1)
  ])
})

type PhotoSendPayload = {
  userID: string
  format: string
  base64Photo: string
}

type PhotoMetricsPayload = {
  timestampSent: number
}

const stripDataUrlPrefix = (photo: string, format: string): string => {
  const prefix = `data:image/${format};base64,`

  return photo.startsWith(prefix) ? photo.slice(prefix.length) : photo
}

const parseJsonMessage = (message: Buffer): unknown =>
  JSON.parse(message.toString())

const parsePhotoSendPayload = (message: Buffer): PhotoSendPayload => {
  const payload = photoSendPayloadSchema.parse(parseJsonMessage(message))
  const userID = String(payload.userId)

  return {
    userID,
    format: payload.format,
    base64Photo: stripDataUrlPrefix(payload.photo, payload.format)
  }
}

/**
 * @deprecated Legacy delimiter payloads are kept only for transition.
 * Prefer JSON payloads on `doorcloud/v1/photo/send`.
 */
const parseLegacyPhotoSendPayload = (message: Buffer): PhotoSendPayload => {
  const [userID, format, photo] = message.toString().split('----')

  if (!userID || !format || !photo)
    throw new Error(
      'Legacy photo send payload must include userID, format, and photo'
    )

  imageFormatSchema.parse(format)

  return {
    userID,
    format,
    base64Photo: stripDataUrlPrefix(photo, format)
  }
}

const parsePhotoMetricsPayload = (message: Buffer): PhotoMetricsPayload => {
  const payload = photoMetricsPayloadSchema.parse(parseJsonMessage(message))
  const timestampSent = Number(payload.timestampSent)

  if (!Number.isFinite(timestampSent))
    throw new Error('timestampSent must be a valid timestamp')

  return { timestampSent }
}

/**
 * @deprecated Legacy delimiter payloads are kept only for transition.
 * Prefer JSON payloads on `doorcloud/v1/photo/metrics`.
 */
const parseLegacyPhotoMetricsPayload = (
  message: Buffer
): PhotoMetricsPayload => {
  const [timestampSent] = message.toString().split('----')
  const parsedTimestamp = Number(timestampSent)

  if (!Number.isFinite(parsedTimestamp))
    throw new Error('Legacy metrics payload must include a valid timestamp')

  return { timestampSent: parsedTimestamp }
}

export {
  parseLegacyPhotoMetricsPayload,
  parseLegacyPhotoSendPayload,
  parsePhotoMetricsPayload,
  parsePhotoSendPayload
}
export type { PhotoMetricsPayload, PhotoSendPayload }
