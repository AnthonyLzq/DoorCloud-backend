import twilio from 'twilio'

declare global {
  // eslint-disable-next-line no-var
  var __twilioClient__: twilio.Twilio
}

const twilioConnection = () => {
  if (!global.__twilioClient__) {
    global.__twilioClient__ = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    )
    console.log('Twilio connection established.')
  }

  return global.__twilioClient__
}

twilioConnection()
  .messages.create({
    from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
    to: `whatsapp:+51936962826`,
    body: 'This may be interesting for you.',
    mediaUrl: [
      'https://images.unsplash.com/photo-1545093149-618ce3bcf49d?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=668&q=80'
    ]
  })
  .then(message => {
    console.log('message', message)
  })

export { twilioConnection }
