import { FastifyBaseLogger } from 'fastify'

import { twilioConnection } from './connection'

const sendPhotoThroughWhatsapp = async (
  imageUrl: string,
  phoneNumber = '+51936962826',
  log: FastifyBaseLogger
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

export { sendPhotoThroughWhatsapp }
