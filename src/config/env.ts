import { z } from 'zod'

const requiredString = (name: string) =>
  z
    .string({ required_error: `${name} is required` })
    .trim()
    .min(1, `${name} cannot be empty`)

const port = (name: string) =>
  z.preprocess(
    value => (value === '' || value === undefined ? value : Number(value)),
    z
      .number({ required_error: `${name} is required` })
      .int(`${name} must be an integer`)
      .min(1, `${name} must be greater than 0`)
      .max(65_535, `${name} must be lower than 65536`)
  )

const optionalPort = (defaultValue: number) =>
  z
    .preprocess(
      value =>
        value === '' || value === undefined ? undefined : Number(value),
      z
        .number()
        .int('PORT must be an integer')
        .min(1, 'PORT must be greater than 0')
        .max(65_535, 'PORT must be lower than 65536')
        .optional()
    )
    .default(defaultValue)

const envSchema = z.object({
  NODE_ENV: z.string().trim().min(1).default('development'),
  PORT: optionalPort(1996),
  MQTT_HOST: requiredString('MQTT_HOST'),
  MQTT_PORT: port('MQTT_PORT'),
  MQTT_USER: requiredString('MQTT_USER'),
  MQTT_PASS: requiredString('MQTT_PASS'),
  SUPABASE_URL: requiredString('SUPABASE_URL').url(
    'SUPABASE_URL must be a URL'
  ),
  SUPABASE_KEY: requiredString('SUPABASE_KEY'),
  TWILIO_ACCOUNT_SID: requiredString('TWILIO_ACCOUNT_SID'),
  TWILIO_AUTH_TOKEN: requiredString('TWILIO_AUTH_TOKEN'),
  TWILIO_PHONE_NUMBER: requiredString('TWILIO_PHONE_NUMBER').regex(
    /^\+[1-9]\d{1,14}$/,
    'TWILIO_PHONE_NUMBER must be an E.164 phone number'
  ),
  MODELS_CDN_URL: requiredString('MODELS_CDN_URL').url(
    'MODELS_CDN_URL must be a URL'
  )
})

type Env = z.infer<typeof envSchema>

const parseEnv = (source: NodeJS.ProcessEnv): Env => {
  const result = envSchema.safeParse(source)

  if (!result.success) {
    const message = result.error.issues
      .map(issue => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n')

    throw new Error(`Invalid environment variables:\n${message}`)
  }

  return result.data
}

const getEnv = (): Env => parseEnv(process.env)

export { getEnv, parseEnv }
export type { Env }
