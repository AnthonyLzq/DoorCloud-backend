import { z } from 'zod'

const requiredString = (name: string) =>
  z
    .string({ error: `${name} is required` })
    .trim()
    .min(1, `${name} cannot be empty`)

const port = (name: string) =>
  z.preprocess(
    value => (value === '' || value === undefined ? value : Number(value)),
    z
      .number({ error: `${name} is required` })
      .int(`${name} must be an integer`)
      .min(1, `${name} must be greater than 0`)
      .max(65_535, `${name} must be lower than 65536`)
  )

const optionalInteger = (
  name: string,
  defaultValue: number,
  min = 0,
  max = Number.MAX_SAFE_INTEGER
) =>
  z
    .preprocess(
      value =>
        value === '' || value === undefined ? undefined : Number(value),
      z
        .number()
        .int(`${name} must be an integer`)
        .min(min, `${name} must be greater than or equal to ${min}`)
        .max(max, `${name} must be lower than or equal to ${max}`)
        .optional()
    )
    .default(defaultValue)

const optionalBoolean = (name: string, defaultValue: boolean) =>
  z
    .preprocess(value => {
      if (value === '' || value === undefined) return undefined
      if (value === 'true' || value === true) return true
      if (value === 'false' || value === false) return false

      return value
    }, z.boolean({ error: `${name} must be true or false` }).optional())
    .default(defaultValue)

const optionalQos = (name: string, defaultValue: 0 | 1 | 2) =>
  z
    .preprocess(
      value =>
        value === '' || value === undefined ? undefined : Number(value),
      z.union([z.literal(0), z.literal(1), z.literal(2)]).optional()
    )
    .default(defaultValue)

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

const optionalString = (name: string) =>
  z.preprocess(
    value => (value === '' || value === undefined ? undefined : value),
    z
      .string({ error: `${name} is required` })
      .trim()
      .min(1)
      .optional()
  )

const commaSeparatedOrigins = (name: string) =>
  z.preprocess(value => {
    if (value === '' || value === undefined) return undefined
    if (typeof value === 'string')
      return value.split(',').map(origin => origin.trim())

    return value
  }, z.array(z.string().trim().min(1)).optional())

const envSchema = z.object({
  NODE_ENV: z.string().trim().min(1).default('development'),
  PORT: optionalPort(1996),
  CORS_ORIGINS: commaSeparatedOrigins('CORS_ORIGINS'),
  MQTT_HOST: requiredString('MQTT_HOST'),
  MQTT_PROTOCOL: z.enum(['mqtt', 'mqtts']).default('mqtts'),
  MQTT_PORT: port('MQTT_PORT'),
  MQTT_USER: requiredString('MQTT_USER'),
  MQTT_PASS: requiredString('MQTT_PASS'),
  MQTT_CLIENT_ID: optionalString('MQTT_CLIENT_ID'),
  MQTT_CLEAN: optionalBoolean('MQTT_CLEAN', true),
  MQTT_KEEPALIVE: optionalInteger('MQTT_KEEPALIVE', 60),
  MQTT_RECONNECT_PERIOD: optionalInteger('MQTT_RECONNECT_PERIOD', 1_000),
  MQTT_CONNECT_TIMEOUT: optionalInteger('MQTT_CONNECT_TIMEOUT', 30_000, 1),
  MQTT_QOS: optionalQos('MQTT_QOS', 0),
  SUPABASE_URL: requiredString('SUPABASE_URL').url(
    'SUPABASE_URL must be a URL'
  ),
  SUPABASE_KEY: requiredString('SUPABASE_KEY'),
  OPENWA_BASE_URL: z
    .preprocess(
      value => (value === '' || value === undefined ? undefined : value),
      z.string().trim().url('OPENWA_BASE_URL must be a URL').optional()
    )
    .default('http://localhost:2785'),
  OPENWA_API_KEY: optionalString('OPENWA_API_KEY'),
  OPENWA_SESSION_ID: optionalString('OPENWA_SESSION_ID').default('main'),
  OPENWA_CHAT_ID: optionalString('OPENWA_CHAT_ID'),
  SETUP_TOKEN: optionalString('SETUP_TOKEN'),
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
