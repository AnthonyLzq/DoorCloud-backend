import { readFileSync, writeFileSync } from 'node:fs'
import {
  createOpenWaSetupConfigSchema,
  DEFAULT_OPENWA_ALLOWED_HOSTS,
  type OpenWaQr,
  type OpenWaSession,
  type OpenWaSetupConfig,
  type OpenWaSetupConfigResult,
  type OpenWaSetupStatus
} from '@doorcloud/shared'
import { getEnv } from 'config/env'
import { getEnvFilePath } from 'config/paths'
import type { FastifyBaseLogger } from 'fastify'
import { requestOpenWa, sendWhatsappImage, sendWhatsappText } from './openwa'

// The setup page writes .env inside the backend package (D4); the write
// target is module-relative (paths.ts) so it never depends on process cwd.
const resolveEnvFilePath = getEnvFilePath

const getConfiguredOpenWaSessionId = (): string => getEnv().OPENWA_SESSION_ID

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )

const getOpenWaMissingConfig = (): string[] => {
  const { OPENWA_API_KEY, OPENWA_CHAT_ID } = getEnv()
  const missing: string[] = []

  if (!OPENWA_API_KEY) missing.push('OPENWA_API_KEY')
  if (!OPENWA_CHAT_ID) missing.push('OPENWA_CHAT_ID')

  return missing
}

const assertOpenWaApiKey = () => {
  const { OPENWA_API_KEY } = getEnv()

  if (!OPENWA_API_KEY) throw new Error('OPENWA_API_KEY is required')
}

const resolveOpenWaSession = async (
  log?: FastifyBaseLogger
): Promise<OpenWaSession | null> => {
  const configuredSessionId = getConfiguredOpenWaSessionId()
  const sessionById = await requestOpenWa<OpenWaSession>({
    log,
    path: `/api/sessions/${configuredSessionId}`,
    throwOnError: false
  })

  if (sessionById.response.ok) return sessionById.data ?? null
  if (sessionById.response.status === 404) return null

  if (
    isUuid(configuredSessionId) ||
    sessionById.response.status !== 400 ||
    !sessionById.text.includes('uuid')
  )
    throw new Error(
      `OpenWA session status failed with ${sessionById.response.status}: ${sessionById.text}`
    )

  const sessions = await requestOpenWa<OpenWaSession[]>({
    log,
    path: '/api/sessions?limit=100&offset=0',
    throwOnError: false
  })

  if (!sessions.response.ok)
    throw new Error(
      `OpenWA sessions list failed with ${sessions.response.status}: ${sessions.text}`
    )

  const session =
    sessions.data?.find(
      item =>
        item.id === configuredSessionId || item.name === configuredSessionId
    ) ?? null

  if (session?.id) saveOpenWaSetupConfig({ OPENWA_SESSION_ID: session.id })

  return session
}

const getOpenWaSetupStatus = async (
  log?: FastifyBaseLogger
): Promise<OpenWaSetupStatus> => {
  const { OPENWA_CHAT_ID, OPENWA_SESSION_ID } = getEnv()
  const missing = getOpenWaMissingConfig()

  if (missing.includes('OPENWA_API_KEY'))
    return {
      configured: missing.length === 0,
      configuredChatId: OPENWA_CHAT_ID,
      configuredSessionId: OPENWA_SESSION_ID,
      missing,
      session: null
    }

  const session = await resolveOpenWaSession(log)
  const currentEnv = getEnv()

  if (!session)
    return {
      configured: missing.length === 0,
      configuredChatId: currentEnv.OPENWA_CHAT_ID,
      configuredSessionId: currentEnv.OPENWA_SESSION_ID,
      missing,
      session: null
    }

  return {
    configured: missing.length === 0,
    configuredChatId: currentEnv.OPENWA_CHAT_ID,
    configuredSessionId: currentEnv.OPENWA_SESSION_ID,
    missing,
    session
  }
}

const ensureOpenWaSession = async (
  log?: FastifyBaseLogger
): Promise<OpenWaSession> => {
  assertOpenWaApiKey()

  const status = await getOpenWaSetupStatus(log)

  if (status.session) return status.session

  const { data, response, text } = await requestOpenWa<OpenWaSession>({
    body: { name: getConfiguredOpenWaSessionId() },
    log,
    method: 'POST',
    path: '/api/sessions',
    throwOnError: false
  })

  if (!response.ok)
    throw new Error(
      `OpenWA session creation failed with ${response.status}: ${text}`
    )

  if (!data) throw new Error('OpenWA session creation response was empty')
  if (data.id) saveOpenWaSetupConfig({ OPENWA_SESSION_ID: data.id })

  return data
}

const startOpenWaSetupSession = async (
  log?: FastifyBaseLogger
): Promise<OpenWaSetupStatus> => {
  const session = await ensureOpenWaSession(log)
  const { response, text } = await requestOpenWa({
    log,
    method: 'POST',
    path: `/api/sessions/${session.id}/start`,
    throwOnError: false
  })

  if (!response.ok && ![400, 409].includes(response.status))
    throw new Error(
      `OpenWA session start failed with ${response.status}: ${text}`
    )

  return await getOpenWaSetupStatus(log)
}

const getOpenWaSetupQr = async (log?: FastifyBaseLogger): Promise<OpenWaQr> => {
  const status = await startOpenWaSetupSession(log)
  const session = status.session ?? (await ensureOpenWaSession(log))
  const { data, response, text } = await requestOpenWa<OpenWaQr>({
    log,
    path: `/api/sessions/${session.id}/qr`,
    throwOnError: false
  })

  if (!response.ok)
    throw new Error(`OpenWA QR request failed with ${response.status}: ${text}`)

  if (!data?.qrCode) throw new Error('OpenWA QR response was empty')

  return data
}

const sendOpenWaSetupTest = async ({
  imageUrl,
  log,
  text = 'DoorCloud OpenWA setup test message'
}: {
  imageUrl?: string
  log?: FastifyBaseLogger
  text?: string
}) => {
  const missing = getOpenWaMissingConfig()

  if (missing.length > 0)
    throw new Error(`Missing OpenWA setup variables: ${missing.join(', ')}`)

  const textMessage = await sendWhatsappText(text, log)

  if (!imageUrl) return { imageMessage: null, textMessage }

  const imageMessage = await sendWhatsappImage({
    imageUrl,
    caption: 'DoorCloud OpenWA setup test image',
    log
  })

  return { imageMessage, textMessage }
}

const writeEnvValue = (envFile: string, key: string, value: string): string => {
  const line = `${key}=${value}`
  const expression = new RegExp(`^\\s*${key}\\s*=.*$`, 'm')

  if (expression.test(envFile)) return envFile.replace(expression, line)

  return `${envFile.trimEnd()}\n${line}\n`
}

const saveOpenWaSetupConfig = ({
  OPENWA_API_KEY,
  OPENWA_BASE_URL,
  OPENWA_CHAT_ID,
  OPENWA_SESSION_ID
}: OpenWaSetupConfig): OpenWaSetupConfigResult => {
  const values = {
    OPENWA_API_KEY,
    OPENWA_BASE_URL,
    OPENWA_CHAT_ID,
    OPENWA_SESSION_ID
  }
  // SECRET-1: re-validate with the configured allowlist at the write
  // boundary (the HTTP route already validated with the default schema).
  const configSchema = createOpenWaSetupConfigSchema(
    getEnv().OPENWA_ALLOWED_HOSTS ?? DEFAULT_OPENWA_ALLOWED_HOSTS
  )
  const parsed = configSchema.safeParse(values)

  if (!parsed.success) {
    const message = parsed.error.issues
      .map(issue => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ')

    throw new Error(`Invalid OpenWA setup config: ${message}`)
  }

  let envFile = ''
  const saved: string[] = []

  try {
    envFile = readFileSync(resolveEnvFilePath(), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue

    envFile = writeEnvValue(envFile, key, value)
    process.env[key] = value
    saved.push(key)
  }

  writeFileSync(resolveEnvFilePath(), envFile)

  return { saved }
}

export {
  ensureOpenWaSession,
  getOpenWaSetupQr,
  getOpenWaSetupStatus,
  saveOpenWaSetupConfig,
  sendOpenWaSetupTest,
  startOpenWaSetupSession
}
