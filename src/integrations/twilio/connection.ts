import twilio from 'twilio'
import { FastifyBaseLogger } from 'fastify'

declare global {
  // eslint-disable-next-line no-var
  var __twilioClient__: twilio.Twilio
}

const twilioConnection = (log?: FastifyBaseLogger) => {
  if (!global.__twilioClient__) {
    global.__twilioClient__ = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    )
    log?.info('Twilio connection established.')
  }

  return global.__twilioClient__
}

export { twilioConnection }
