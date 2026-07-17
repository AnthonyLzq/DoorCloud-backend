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

const parsePhotoMetricsPayload = (message: Buffer): PhotoMetricsPayload => {
  const payload = photoMetricsPayloadSchema.parse(parseJsonMessage(message))
  const timestampSent = Number(payload.timestampSent)

  if (!Number.isFinite(timestampSent))
    throw new Error('timestampSent must be a valid timestamp')

  return { timestampSent }
}

export type { PhotoMetricsPayload, PhotoSendPayload }
export { parsePhotoMetricsPayload, parsePhotoSendPayload }
