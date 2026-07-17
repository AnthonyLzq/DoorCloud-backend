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
  log
}: {
  imageUrl: string
  success: boolean
  name?: string
  phoneNumber?: string
  log?: FastifyBaseLogger
}) => {
  await sendWhatsappImage({
    imageUrl,
    caption: success
      ? `The result of the recognition process was successful. ${name} is here.`
      : 'The result of the recognition process was not successful.',
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
