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

const openWaSetupConfigSchema = z.object({
  OPENWA_API_KEY: z.string().trim().min(1).optional(),
  OPENWA_BASE_URL: z.string().trim().url().optional(),
  OPENWA_CHAT_ID: z.string().trim().min(1).optional(),
  OPENWA_SESSION_ID: z.string().trim().min(1).optional()
})

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
  openWaQrSchema,
  openWaSessionSchema,
  openWaSetupConfigResultSchema,
  openWaSetupConfigSchema,
  openWaSetupStatusSchema
}
