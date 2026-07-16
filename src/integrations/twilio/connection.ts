import twilio from 'twilio'
import { FastifyBaseLogger } from 'fastify'

import { getEnv } from 'config/env'

declare global {
  // eslint-disable-next-line no-var
  var __twilioClient__: twilio.Twilio
}

const twilioConnection = (log?: FastifyBaseLogger) => {
  if (!global.__twilioClient__) {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = getEnv()

    global.__twilioClient__ = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    log?.info('Twilio connection established.')
  }

  return global.__twilioClient__
}

export { twilioConnection }
