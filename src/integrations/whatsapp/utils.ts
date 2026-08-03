import type { FastifyBaseLogger } from 'fastify'

import { sendWhatsappImage, sendWhatsappText } from './openwa'

const sayHelloThroughWhatsapp = async (
  name: string,
  _phoneNumber?: string,
  log?: FastifyBaseLogger
) => {
  await sendWhatsappText(`Hello ${name}, how is it going?`, log)
  log?.info('Hello message sent')
}

const sendPhotoThroughWhatsappWithTemplate = async (
  imageUrl: string,
  _phoneNumber?: string,
  log?: FastifyBaseLogger
) => {
  await sendWhatsappImage({
    imageUrl,
    caption: 'This may be interesting for you.',
    log
  })
  log?.info('Image sent')
}

const sendPhotoThroughWhatsappWithoutTemplate = async (
  imageUrl: string,
  message: string,
  _phoneNumber?: string,
  log?: FastifyBaseLogger
) => {
  await sendWhatsappImage({
    imageUrl,
    caption: message,
    log
  })
  log?.info('Image sent')
}

const sendPhotoDetectionResultThroughWhatsapp = async ({
  imageUrl,
  success,
  name,
  similarity,
  threshold,
  log
}: {
  imageUrl: string
  success: boolean
  name?: string
  similarity?: number
  threshold: number
  phoneNumber?: string
  log?: FastifyBaseLogger
}) => {
  // Margin above the verification threshold that counts as a confident match.
  // Placeholder band until the recognition pipeline exposes calibrated
  // confidence levels; tune MATCH_CONFIDENCE_MARGIN with real similarities.
  const MATCH_CONFIDENCE_MARGIN = 0.05

  let caption: string
  if (!success) {
    caption = 'Hey, I do not know who this is, but he/she is at your door.'
  } else if (
    similarity !== undefined &&
    similarity < threshold + MATCH_CONFIDENCE_MARGIN
  ) {
    caption = `Hey, I think ${name} is here, check it out!`
  } else {
    caption = `Hey, ${name} is here!`
  }

  await sendWhatsappImage({
    imageUrl,
    caption,
    log
  })
  log?.info('Image sent')
}

export {
  sayHelloThroughWhatsapp,
  sendPhotoDetectionResultThroughWhatsapp,
  sendPhotoThroughWhatsappWithoutTemplate,
  sendPhotoThroughWhatsappWithTemplate
}
