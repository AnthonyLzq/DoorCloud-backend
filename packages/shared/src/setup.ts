import { z } from 'zod'

const openWaSessionSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  phone: z.string().nullable().optional(),
  status: z.string().optional()
})

const openWaQrSchema = z.object({
  qrCode: z.string(),
  status: z.string().optional()
})

// WF-3: the status payload distinguishes paired (session object) and
// unpaired (session: null) states.
const openWaSetupStatusSchema = z.object({
  configured: z.boolean(),
  configuredChatId: z.string().optional(),
  configuredSessionId: z.string(),
  missing: z.array(z.string()),
  session: openWaSessionSchema.nullable()
})

// SECRET-1: loopback hosts are always allowed (local dev); any other host
// must be in the operator-provided allowlist. The allowlist is env-controlled
// (OPENWA_ALLOWED_HOSTS), so the setup page cannot exfiltrate OPENWA_API_KEY
// to an arbitrary host.
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

const normalizeHost = (host: string): string =>
  host.toLowerCase().replace(/^\[|\]$/g, '')

const isOpenWaBaseUrlAllowed = (
  value: string,
  allowHosts: string[]
): boolean => {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }

  const hostname = normalizeHost(url.hostname)
  if (loopbackHosts.has(hostname)) return true

  return allowHosts.map(normalizeHost).includes(hostname)
}

const DEFAULT_OPENWA_ALLOWED_HOSTS = ['localhost']

const openWaBaseUrlField = (allowHosts: string[]) =>
  z
    .string()
    .trim()
    .url('OPENWA_BASE_URL must be a URL')
    .refine(value => isOpenWaBaseUrlAllowed(value, allowHosts), {
      message:
        'OPENWA_BASE_URL host must be loopback or in the OpenWA allowlist'
    })
    .optional()

// SECRET-1: the setup schema enforces the same constraint as env validation,
// so a payload with a non-HTTPS or non-allowlisted base URL fails with 400.
const createOpenWaSetupConfigSchema = (
  allowHosts: string[] = DEFAULT_OPENWA_ALLOWED_HOSTS
) =>
  z.object({
    OPENWA_API_KEY: z.string().trim().min(1).optional(),
    OPENWA_BASE_URL: openWaBaseUrlField(allowHosts),
    OPENWA_CHAT_ID: z.string().trim().min(1).optional(),
    OPENWA_SESSION_ID: z.string().trim().min(1).optional()
  })

const openWaSetupConfigSchema = createOpenWaSetupConfigSchema()

const openWaSetupConfigResultSchema = z.object({
  saved: z.array(z.string())
})

export type OpenWaQr = z.infer<typeof openWaQrSchema>
export type OpenWaSession = z.infer<typeof openWaSessionSchema>
export type OpenWaSetupConfig = z.infer<typeof openWaSetupConfigSchema>
export type OpenWaSetupConfigResult = z.infer<
  typeof openWaSetupConfigResultSchema
>
export type OpenWaSetupStatus = z.infer<typeof openWaSetupStatusSchema>

export {
  createOpenWaSetupConfigSchema,
  DEFAULT_OPENWA_ALLOWED_HOSTS,
  isOpenWaBaseUrlAllowed,
  openWaQrSchema,
  openWaSessionSchema,
  openWaSetupConfigResultSchema,
  openWaSetupConfigSchema,
  openWaSetupStatusSchema
}
