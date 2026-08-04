import { getEnv } from 'config/env'
import type { FastifyBaseLogger } from 'fastify'

type OpenWaMessageResponse = {
  messageId: string
  timestamp: number
}

type OpenWaRequestBody = Record<string, unknown>

type OpenWaSession = {
  id: string
  name?: string
}

type OpenWaRequestOptions = {
  body?: OpenWaRequestBody
  log?: FastifyBaseLogger
  method?: 'GET' | 'POST'
  path: string
  throwOnError?: boolean
}

type OpenWaResponse<T> = {
  data?: T
  response: Response
  text: string
}

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )

const getOpenWaUrl = (path: string): string => {
  const { OPENWA_BASE_URL } = getEnv()

  return new URL(path, OPENWA_BASE_URL).toString()
}

const requiredOpenWaEnv = (
  name: 'OPENWA_API_KEY' | 'OPENWA_CHAT_ID' | 'OPENWA_SESSION_ID'
): string => {
  const value = getEnv()[name]

  if (!value) throw new Error(`${name} is required`)

  return value
}

const parseOpenWaResponse = <T>(text: string): T | undefined => {
  if (!text) return undefined

  try {
    return JSON.parse(text) as T
  } catch {
    return undefined
  }
}

const requestOpenWa = async <T = unknown>({
  body,
  log,
  method = 'GET',
  path,
  throwOnError = true
}: OpenWaRequestOptions): Promise<OpenWaResponse<T>> => {
  const openWaApiKey = requiredOpenWaEnv('OPENWA_API_KEY')
  const response = await fetch(getOpenWaUrl(path), {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      'X-API-Key': openWaApiKey
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()

  if (!response.ok && throwOnError) {
    log?.error(
      { status: response.status, responseBody: text },
      'OpenWA message request failed'
    )

    throw new Error(
      `OpenWA message request failed with ${response.status}: ${text}`
    )
  }

  return {
    data: parseOpenWaResponse<T>(text),
    response,
    text
  }
}

// OpenWA keys running engines by the session id used at start time (a UUID),
// so a configured NAME like 'main' never matches the active engine and every
// send fails with "Session 'main' is not active". Resolve the configured
// name to its session id before sending; UUIDs pass through untouched.
const resolveOpenWaSessionId = async (
  log?: FastifyBaseLogger
): Promise<string> => {
  const configuredSessionId = requiredOpenWaEnv('OPENWA_SESSION_ID')

  if (isUuid(configuredSessionId)) return configuredSessionId

  const { data, response, text } = await requestOpenWa<OpenWaSession[]>({
    log,
    path: '/api/sessions?limit=100&offset=0',
    throwOnError: false
  })

  if (!response.ok)
    throw new Error(
      `OpenWA sessions list failed with ${response.status}: ${text}`
    )

  const session = data?.find(item => item.name === configuredSessionId)

  if (!session?.id)
    throw new Error(
      `OpenWA session '${configuredSessionId}' was not found. Create and start it from /setup first.`
    )

  return session.id
}

const postOpenWaMessage = async (
  endpoint: string,
  body: OpenWaRequestBody,
  log?: FastifyBaseLogger
): Promise<OpenWaMessageResponse> => {
  const openWaSessionId = await resolveOpenWaSessionId(log)
  const { data } = await requestOpenWa<OpenWaMessageResponse>({
    body,
    log,
    method: 'POST',
    path: `/api/sessions/${openWaSessionId}/messages/${endpoint}`
  })

  if (!data) throw new Error('OpenWA message response was empty')

  return data
}

const getOpenWaChatId = (): string => requiredOpenWaEnv('OPENWA_CHAT_ID')

const sendWhatsappText = async (
  text: string,
  log?: FastifyBaseLogger
): Promise<OpenWaMessageResponse> =>
  await postOpenWaMessage(
    'send-text',
    {
      chatId: getOpenWaChatId(),
      text
    },
    log
  )

const sendWhatsappImage = async ({
  imageUrl,
  caption,
  log
}: {
  imageUrl: string
  caption: string
  log?: FastifyBaseLogger
}): Promise<OpenWaMessageResponse> =>
  await postOpenWaMessage(
    'send-image',
    {
      caption,
      chatId: getOpenWaChatId(),
      url: imageUrl
    },
    log
  )

export type { OpenWaMessageResponse, OpenWaResponse }
export { requestOpenWa, sendWhatsappImage, sendWhatsappText }
