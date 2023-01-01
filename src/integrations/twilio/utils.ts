import { twilioConnection } from './connection'

const sendPictureThroughWhatsapp = async (
  imageUrl: string,
  phoneNumber = '+51936962826'
) => {
  const client = twilioConnection()

  await client.messages.create({
    from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
    to: `whatsapp:${phoneNumber}`,
    body: 'This may be interesting for you.',
    mediaUrl: [imageUrl]
  })

  console.log('Image sent')
}

export { sendPictureThroughWhatsapp }
