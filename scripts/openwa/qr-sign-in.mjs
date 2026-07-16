import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const envPath = resolve(process.cwd(), '.env')

const loadDotEnv = () => {
  try {
    const env = readFileSync(envPath, 'utf8')

    for (const line of env.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)

      if (!match) continue

      const [, key, rawValue] = match

      if (process.env[key]) continue

      process.env[key] = rawValue.replace(/^['"]|['"]$/g, '')
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

const requiredEnv = name => {
  const value = process.env[name]?.trim()

  if (!value) throw new Error(`${name} is required`)

  return value
}

const openWaUrl = (baseUrl, path) => new URL(path, baseUrl).toString()

const openWaRequest = async ({ apiKey, baseUrl, path, method = 'GET', body }) => {
  const response = await fetch(openWaUrl(baseUrl, path), {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      'X-API-Key': apiKey
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()
  const data = text ? parseResponseBody(text) : undefined

  return { data, response, text }
}

const parseResponseBody = text => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const ensureSession = async ({ apiKey, baseUrl, sessionId }) => {
  const session = await openWaRequest({
    apiKey,
    baseUrl,
    path: `/api/sessions/${sessionId}`
  })

  if (session.response.ok) return sessionId
  if (session.response.status !== 404)
    throw new Error(
      `OpenWA session lookup failed with ${session.response.status}: ${session.text}`
    )

  const created = await openWaRequest({
    apiKey,
    baseUrl,
    path: '/api/sessions',
    method: 'POST',
    body: { name: sessionId }
  })

  if (!created.response.ok)
    throw new Error(
      `OpenWA session creation failed with ${created.response.status}: ${created.text}`
    )

  const createdId = created.data?.id ?? sessionId

  if (createdId !== sessionId)
    console.warn(
      `Created OpenWA session ${createdId}. Set OPENWA_SESSION_ID=${createdId} for DoorCloud sends.`
    )

  return createdId
}

const startSession = async ({ apiKey, baseUrl, sessionId }) => {
  const started = await openWaRequest({
    apiKey,
    baseUrl,
    path: `/api/sessions/${sessionId}/start`,
    method: 'POST'
  })

  if (started.response.ok) return

  if (![400, 409].includes(started.response.status))
    throw new Error(
      `OpenWA session start failed with ${started.response.status}: ${started.text}`
    )
}

const waitForQr = async ({ apiKey, baseUrl, sessionId }) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const qr = await openWaRequest({
      apiKey,
      baseUrl,
      path: `/api/sessions/${sessionId}/qr`
    })

    if (qr.response.ok && qr.data?.qrCode) return qr.data.qrCode

    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  throw new Error(
    'OpenWA QR was not ready after 30 seconds. Check the OpenWA session status.'
  )
}

const writeQrPng = (dataUrl, outputPath) => {
  const match = dataUrl.match(/^data:image\/png;base64,(.+)$/)

  if (!match) throw new Error('OpenWA returned an invalid QR PNG data URL')

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, Buffer.from(match[1], 'base64'))
}

const main = async () => {
  loadDotEnv()

  const baseUrl = requiredEnv('OPENWA_BASE_URL')
  const apiKey = requiredEnv('OPENWA_API_KEY')
  const configuredSessionId = requiredEnv('OPENWA_SESSION_ID')
  const outputPath = resolve(
    process.cwd(),
    process.env.OPENWA_QR_PATH || '.openwa/qr.png'
  )
  const sessionId = await ensureSession({
    apiKey,
    baseUrl,
    sessionId: configuredSessionId
  })

  await startSession({ apiKey, baseUrl, sessionId })

  const qrCode = await waitForQr({ apiKey, baseUrl, sessionId })

  writeQrPng(qrCode, outputPath)
  console.log(`OpenWA sign-in QR saved to ${outputPath}`)
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
