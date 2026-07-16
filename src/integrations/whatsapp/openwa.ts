import type { FastifyBaseLogger } from 'fastify'

import { getEnv } from 'config/env'

type OpenWaMessageResponse = {
  messageId: string
  timestamp: number
}

type OpenWaRequestBody = Record<string, unknown>

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

    throw new Error(`OpenWA message request failed with ${response.status}`)
  }

  return {
    data: parseOpenWaResponse<T>(text),
    response,
    text
  }
}

const postOpenWaMessage = async (
  endpoint: string,
  body: OpenWaRequestBody,
  log?: FastifyBaseLogger
): Promise<OpenWaMessageResponse> => {
  const openWaSessionId = requiredOpenWaEnv('OPENWA_SESSION_ID')
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

export { requestOpenWa, sendWhatsappImage, sendWhatsappText }
export type { OpenWaMessageResponse, OpenWaResponse }
