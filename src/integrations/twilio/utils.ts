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

const sendPhotoThroughWhatsapp = async (
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

export { sayHelloThroughWhatsapp, sendPhotoThroughWhatsapp }
