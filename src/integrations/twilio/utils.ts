import { FastifyBaseLogger } from 'fastify'

import { twilioConnection } from './connection'

const sayHelloThroughWhatsapp = async (
  name: string,
  phoneNumber = '+51936962826',
  log?: FastifyBaseLogger
) => {
  const client = twilioConnection()

  await client.messages.create({
    from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
    to: `whatsapp:${phoneNumber}`,
    body: `Hello ${name}, how is it going?`
  })

  log?.info('Hello message sent')
}

const sendPhotoThroughWhatsappWithTemplate = async (
  imageUrl: string,
  phoneNumber = '+51936962826',
  log?: FastifyBaseLogger
) => {
  const client = twilioConnection()

  await client.messages.create({
    from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
    to: `whatsapp:${phoneNumber}`,
    body: 'This may be interesting for you.',
    mediaUrl: [imageUrl]
  })

  log?.info('Image sent')
}

const sendPhotoThroughWhatsappWithoutTemplate = async (
  imageUrl: string,
  message: string,
  phoneNumber = '+51936962826',
  log?: FastifyBaseLogger
) => {
  const client = twilioConnection()

  await client.messages.create({
    from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
    to: `whatsapp:${phoneNumber}`,
    body: message,
    mediaUrl: [imageUrl]
  })

  log?.info('Image sent')
}

const sendPhotoDetectionResultThroughWhatsapp = async ({
  imageUrl,
  success,
  name,
  phoneNumber = '+51936962826',
  log
}: {
  imageUrl: string
  success: boolean
  name?: string
  phoneNumber?: string
  log?: FastifyBaseLogger
}) => {
  const client = twilioConnection()

  await client.messages.create({
    from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
    to: `whatsapp:${phoneNumber}`,
    body: success
      ? `The result of the recognition process was successful. ${name} is here.`
      : `The result of the recognition process was not successful.`,
    mediaUrl: [imageUrl]
  })

  log?.info('Image sent')
}

export {
  sayHelloThroughWhatsapp,
  sendPhotoThroughWhatsappWithTemplate,
  sendPhotoThroughWhatsappWithoutTemplate,
  sendPhotoDetectionResultThroughWhatsapp
}
